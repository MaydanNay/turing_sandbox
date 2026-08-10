"""Authoritative voting + reveal-turn queue for a room."""

from __future__ import annotations

import logging
import random
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.connection_manager import manager
from app.event_bus import event_bus
from app.redis_state import CHARACTER_IDS, redis_store
from app.schemas import Phase, RoomState, room_state_for_client
from app.services.card_deal import public_card_view
from app.services.phase_machine import BASE_DURATION_SECONDS, duration_seconds

logger = logging.getLogger(__name__)

REVEAL_CARD_BY_PHASE: dict[Phase, str] = {
    Phase.pitch: "skill",
    Phase.conflict: "biometrics",
    Phase.revision: "inventory",
    Phase.turing: "trait",
}

VOTE_PHASES = {Phase.conflict, Phase.revision, Phase.turing}
BASE_VOTE_WINDOW_SECONDS = 60.0
BASE_REVEAL_TURN_SECONDS = 45.0
_MIN_WINDOW = 8.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def vote_window_seconds(phase: Phase, state: RoomState | None = None) -> float:
    if phase not in VOTE_PHASES:
        return 0.0
    design_full = BASE_DURATION_SECONDS.get(phase, 60.0)
    actual = duration_seconds(phase, state)
    return max(_MIN_WINDOW, BASE_VOTE_WINDOW_SECONDS * (actual / max(1.0, design_full)))


def reveal_turn_seconds(state: RoomState | None = None) -> float:
    from app.services.phase_machine import phase_scale_for_room

    scale = phase_scale_for_room(state)
    return max(_MIN_WINDOW, BASE_REVEAL_TURN_SECONDS * scale)


def _alive_players(state: RoomState) -> list[tuple[str, Any]]:
    return [(cid, p) for cid, p in state.players.items() if p.is_alive]


def _character_sort_key(character_id: str | None) -> int:
    if not character_id:
        return 999
    try:
        return list(CHARACTER_IDS).index(character_id)
    except ValueError:
        return 500


def _current_reveal_client(state: RoomState) -> str | None:
    if not state.reveal_queue:
        return None
    if state.reveal_index < 0 or state.reveal_index >= len(state.reveal_queue):
        return None
    return state.reveal_queue[state.reveal_index]


async def _broadcast(room_id: str, message: dict[str, Any], *, action_type: str) -> None:
    await manager.broadcast(room_id, message)
    await redis_store.append_event(
        room_id,
        {
            "user_id": message.get("client_id") or "system",
            "is_ai": False,
            "action_type": action_type,
            "raw_payload": message,
            "timestamp": message.get("ts") or _now_iso(),
        },
    )
    await event_bus.publish(
        "message",
        {
            "room_id": room_id,
            "action": action_type,
            "phase": message.get("phase"),
            "is_ai": False,
        },
    )


def clear_reveal(state: RoomState) -> None:
    state.reveal_queue = []
    state.reveal_index = 0
    state.reveal_deadline_ts = None
    state.reveal_card_type = None


def clear_votes(state: RoomState) -> None:
    state.votes = {}
    state.vote_open = False


async def on_phase_enter(room_id: str, state: RoomState) -> RoomState:
    """Reset vote/reveal machinery for the new phase."""
    clear_votes(state)
    card_type = REVEAL_CARD_BY_PHASE.get(state.phase)
    if card_type:
        alive = _alive_players(state)
        alive.sort(key=lambda item: _character_sort_key(item[1].character_id))
        state.reveal_queue = [cid for cid, _ in alive]
        state.reveal_index = 0
        state.reveal_card_type = card_type
        state.reveal_deadline_ts = (
            time.time() + reveal_turn_seconds(state) if state.reveal_queue else None
        )
    else:
        clear_reveal(state)

    await redis_store.save_room(state)
    if state.reveal_queue:
        await broadcast_reveal_turn(room_id, state)
    return state


async def broadcast_reveal_turn(room_id: str, state: RoomState) -> None:
    current = _current_reveal_client(state)
    player = state.players.get(current) if current else None
    msg = {
        "type": "reveal_turn",
        "room_id": room_id,
        "client_id": current,
        "character_id": player.character_id if player else None,
        "card_type": state.reveal_card_type,
        "deadline_ts": state.reveal_deadline_ts,
        "queue_index": state.reveal_index,
        "queue_len": len(state.reveal_queue),
        "state": room_state_for_client(state),
        "ts": _now_iso(),
    }
    await _broadcast(room_id, msg, action_type="reveal_turn")


async def advance_reveal(
    room_id: str,
    state: RoomState,
    *,
    broadcast: bool = True,
    expected_client_id: str | None = None,
) -> RoomState:
    """Advance queue. If expected_client_id is set, no-op when turn already moved."""
    # Re-read to avoid double-advance races (human reveal vs timeout tick)
    fresh = await redis_store.get_room(room_id)
    if fresh is None:
        return state
    state = fresh
    current = _current_reveal_client(state)
    if expected_client_id is not None and current != expected_client_id:
        return state

    state.reveal_index += 1
    if state.reveal_index >= len(state.reveal_queue):
        clear_reveal(state)
    else:
        state.reveal_deadline_ts = time.time() + reveal_turn_seconds(state)
    await redis_store.save_room(state)
    if broadcast:
        await broadcast_reveal_turn(room_id, state)
    return state


async def cast_vote(
    room_id: str,
    voter_client_id: str,
    target_character_id: str,
) -> tuple[RoomState | None, str | None]:
    state = await redis_store.get_room(room_id)
    if state is None:
        return None, "room_missing"
    if not state.vote_open:
        return state, "vote_closed"
    voter = state.players.get(voter_client_id)
    if voter is None or not voter.is_alive:
        return state, "voter_invalid"
    if voter.character_id == target_character_id:
        return state, "self_vote"
    target = next(
        (
            p
            for p in state.players.values()
            if p.character_id == target_character_id and p.is_alive
        ),
        None,
    )
    if target is None:
        return state, "target_invalid"
    if target_character_id in state.brig_character_ids:
        return state, "already_brigged"
    if len(state.brig_character_ids) >= settings.brig_capacity:
        return state, "brig_full"

    state.votes[voter_client_id] = target_character_id
    await redis_store.save_room(state)

    msg = {
        "type": "vote_cast",
        "room_id": room_id,
        "client_id": voter_client_id,
        "character_id": voter.character_id,
        "target_character_id": target_character_id,
        "votes": dict(state.votes),
        "state": room_state_for_client(state),
        "ts": _now_iso(),
    }
    await _broadcast(room_id, msg, action_type="vote_cast")
    return state, None


async def resolve_votes(room_id: str, state: RoomState) -> RoomState:
    """Tally votes: unique majority → brig; tie / empty → no brig."""
    if not state.votes:
        clear_votes(state)
        await redis_store.save_room(state)
        msg = {
            "type": "vote_resolved",
            "room_id": room_id,
            "tied": False,
            "target_character_id": None,
            "brig_character_ids": list(state.brig_character_ids),
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        }
        await _broadcast(room_id, msg, action_type="vote_resolved")
        return state

    counts = Counter(state.votes.values())
    top = counts.most_common()
    tied = len(top) >= 2 and top[0][1] == top[1][1]
    winner: str | None = None
    if not tied and top:
        winner = top[0][0]

    # Full brig isolates seats only — never ends the match early
    if (
        winner
        and winner not in state.brig_character_ids
        and len(state.brig_character_ids) < settings.brig_capacity
    ):
        state.brig_character_ids.append(winner)
        for cid, player in list(state.players.items()):
            if player.character_id == winner:
                state.players[cid] = player.model_copy(update={"is_alive": False})

    clear_votes(state)
    # Drop dead players from an in-progress reveal queue
    if state.reveal_queue:
        state.reveal_queue = [
            cid
            for cid in state.reveal_queue
            if state.players.get(cid) and state.players[cid].is_alive
        ]
        if state.reveal_index >= len(state.reveal_queue):
            clear_reveal(state)

    await redis_store.save_room(state)
    msg = {
        "type": "vote_resolved",
        "room_id": room_id,
        "tied": tied or winner is None,
        "target_character_id": winner,
        "brig_character_ids": list(state.brig_character_ids),
        "state": room_state_for_client(state),
        "ts": _now_iso(),
    }
    await _broadcast(room_id, msg, action_type="vote_resolved")
    logger.info(
        "vote resolved room=%s winner=%s tied=%s brig=%s",
        room_id,
        winner,
        tied,
        state.brig_character_ids,
    )
    return state


async def autofill_bot_votes(room_id: str, state: RoomState) -> RoomState:
    if not state.vote_open:
        return state
    alive = _alive_players(state)
    targets = [
        p.character_id
        for _, p in alive
        if p.character_id and p.character_id not in state.brig_character_ids
    ]
    if not targets:
        return state
    changed = False
    for cid, player in alive:
        if not player.is_ai:
            continue
        if cid in state.votes:
            continue
        options = [t for t in targets if t != player.character_id]
        if not options:
            continue
        state.votes[cid] = random.choice(options)
        changed = True
    if changed:
        await redis_store.save_room(state)
        msg = {
            "type": "vote_cast",
            "room_id": room_id,
            "client_id": "system:bots",
            "character_id": None,
            "target_character_id": None,
            "votes": dict(state.votes),
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        }
        await _broadcast(room_id, msg, action_type="vote_cast")
    return state


async def sync_vote_window(room_id: str, state: RoomState) -> RoomState:
    """Open vote window in the last N seconds of CONFLICT/REVISION/TURING."""
    if state.phase not in VOTE_PHASES:
        if state.vote_open:
            clear_votes(state)
            await redis_store.save_room(state)
        return state
    if state.phase_deadline_ts is None:
        return state

    remaining = state.phase_deadline_ts - time.time()
    window = vote_window_seconds(state.phase, state)
    should_open = remaining <= window and remaining > 0

    if should_open and not state.vote_open:
        # Close reveal if still running — voting takes over the table
        clear_reveal(state)
        state.votes = {}
        state.vote_open = True
        await redis_store.save_room(state)
        msg = {
            "type": "vote_opened",
            "room_id": room_id,
            "deadline_ts": state.phase_deadline_ts,
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        }
        await _broadcast(room_id, msg, action_type="vote_opened")
        logger.info("vote opened room=%s remaining=%.1f", room_id, remaining)
    return state


async def force_reveal_or_skip(room_id: str, state: RoomState) -> RoomState:
    """On reveal timeout: always force-reveal the required card when present."""
    current = _current_reveal_client(state)
    card_type = state.reveal_card_type
    if not current or not card_type:
        return await advance_reveal(room_id, state)

    hand = await redis_store.get_hand(room_id, current)
    picked: dict[str, Any] | None = None
    if hand:
        for card in hand:
            if (
                str(card.get("type")) == card_type
                and not card.get("is_revealed")
                and str(card.get("type")) != "secret_mission"
            ):
                picked = card
                break

    if picked is None:
        logger.warning(
            "force reveal: no unrevealed %s for client=%s room=%s — advancing",
            card_type,
            current,
            room_id,
        )
        return await advance_reveal(room_id, state, expected_client_id=current)

    card_id = str(picked.get("id"))
    card, err = await redis_store.reveal_card_in_hand(room_id, current, card_id)
    if err is not None or card is None:
        logger.warning(
            "force reveal failed room=%s client=%s card=%s err=%s",
            room_id,
            current,
            card_id,
            err,
        )
        return await advance_reveal(room_id, state, expected_client_id=current)

    player = state.players.get(current)
    public = public_card_view(card)
    if public is not None:
        out = {
            "type": "card_revealed",
            "room_id": room_id,
            "client_id": current,
            "character_id": player.character_id if player else None,
            "card": public,
            "forced": True,
            "ts": _now_iso(),
        }
        await manager.broadcast(room_id, out)
        await redis_store.append_event(
            room_id,
            {
                "user_id": current,
                "is_ai": bool(player and player.is_ai),
                "action_type": "reveal_card",
                "raw_payload": out,
                "timestamp": out["ts"],
            },
        )
        await manager.send_personal(
            room_id,
            current,
            {
                "type": "hand",
                "room_id": room_id,
                "client_id": current,
                "cards": await redis_store.get_hand(room_id, current),
                "ts": _now_iso(),
            },
        )

    return await advance_reveal(room_id, state, expected_client_id=current)


async def tick_match_flow(room_id: str, state: RoomState) -> RoomState:
    """Per-second hooks: reveal timeout, vote window, bot votes."""
    # Reveal timeout (only while vote is closed)
    if (
        not state.vote_open
        and state.reveal_deadline_ts is not None
        and time.time() >= state.reveal_deadline_ts
        and state.reveal_queue
    ):
        state = await force_reveal_or_skip(room_id, state)

    state = await sync_vote_window(room_id, state)
    if state.vote_open:
        state = await autofill_bot_votes(room_id, state)
    return state


async def validate_player_reveal(
    room_id: str,
    client_id: str,
    card_type: str | None,
) -> str | None:
    """Return error string if this client may not reveal now."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return "room_missing"
    if state.vote_open:
        return "vote_in_progress"
    current = _current_reveal_client(state)
    if current is None:
        return "no_reveal_turn"
    if current != client_id:
        return "not_your_turn"
    if state.reveal_card_type and card_type and card_type != state.reveal_card_type:
        return f"wrong_card_type:{state.reveal_card_type}"
    return None
