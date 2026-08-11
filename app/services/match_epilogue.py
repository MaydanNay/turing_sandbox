"""Convoy boarding epilogue: report + authoritative match finish."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.connection_manager import manager
from app.event_bus import event_bus
from app.redis_state import redis_store
from app.schemas import Faction, Phase, RoomState, room_state_for_client
from app.services.helixa_adapter import canonical_agent_id
from app.services.session_finish import finish_session

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_epilogue_report(state: RoomState) -> dict[str, Any]:
    """Who boarded the Convoy vs Brig.

    Win condition (humans): synthetics_in_convoy == 0.
    Any Synthetic on board (≥1) → SYNTHETICS win / human loss.
    """
    brig_set = set(state.brig_character_ids)
    player_ids = list(state.players.keys())

    convoy: list[dict[str, Any]] = []
    brig: list[dict[str, Any]] = []
    players_out: list[dict[str, Any]] = []

    for client_id, player in state.players.items():
        character_id = player.character_id
        faction = player.faction.value if player.faction else None
        name = character_id or client_id
        in_brig = bool(character_id and character_id in brig_set)
        in_convoy = bool(player.is_alive and not in_brig)
        location = "brig" if in_brig else ("convoy" if in_convoy else "out")

        row = {
            "client_id": client_id,
            "character_id": character_id,
            "name": name,
            "role": player.role,
            "faction": faction,
            "is_ai": player.is_ai,
            "location": location,
            "in_convoy": in_convoy,
            "in_brig": in_brig,
        }
        players_out.append(row)
        slim = {
            "client_id": client_id,
            "character_id": character_id,
            "name": name,
            "role": player.role,
            "faction": faction,
            "is_ai": player.is_ai,
        }
        if in_brig:
            brig.append(slim)
        elif in_convoy:
            convoy.append(slim)

    synthetics_in_convoy = sum(
        1 for p in convoy if (p.get("faction") or "").upper() == Faction.synthetic.value
    )
    winning_team = "HUMAN" if synthetics_in_convoy == 0 else "SYNTHETICS"

    brig_agents: list[str] = []
    for row in brig:
        cid = row.get("client_id")
        if not cid:
            continue
        brig_agents.append(
            canonical_agent_id(
                player_ids,
                str(cid),
                character_id=row.get("character_id"),
            )
        )

    survived_agents: list[str] = []
    for row in convoy:
        if not row.get("is_ai"):
            continue
        cid = row.get("client_id")
        if not cid:
            continue
        survived_agents.append(
            canonical_agent_id(
                player_ids,
                str(cid),
                character_id=row.get("character_id"),
            )
        )

    return {
        "winning_team": winning_team,
        "synthetics_in_convoy": synthetics_in_convoy,
        "convoy": convoy,
        "brig": brig,
        "players": players_out,
        "brig_agents": brig_agents,
        "survived_agents": survived_agents,
    }


async def finalize_match(room_id: str) -> RoomState | None:
    """End boarding: broadcast match_ended, persist Finished, delete Redis room.

    Idempotent: safe if scheduler retries after a partial failure
    (phase already Finished but Redis room not yet deleted).
    """
    state = await redis_store.get_room(room_id)
    if state is None:
        return None

    already_finished = state.phase == Phase.finished
    if not already_finished and state.phase != Phase.resolve:
        return state

    # Re-read before claiming finish to reduce double-broadcast races
    if not already_finished:
        fresh = await redis_store.get_room(room_id)
        if fresh is None:
            return None
        if fresh.phase == Phase.finished:
            already_finished = True
            state = fresh
        elif fresh.phase != Phase.resolve:
            return fresh
        else:
            state = fresh

    report = build_epilogue_report(state)

    if not already_finished:
        state = await redis_store.set_phase(room_id, Phase.finished, None)
        payload = {
            "winning_team": report["winning_team"],
            "synthetics_in_convoy": report["synthetics_in_convoy"],
            "convoy": report["convoy"],
            "brig": report["brig"],
            "players": report["players"],
        }
        msg = {
            "type": "match_ended",
            "room_id": room_id,
            "phase": Phase.finished.value,
            "payload": payload,
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        }
        await manager.broadcast(room_id, msg)
        await redis_store.append_event(
            room_id,
            {
                "user_id": "system",
                "is_ai": False,
                "action_type": "match_ended",
                "raw_payload": msg,
                "timestamp": msg["ts"],
            },
        )
        await event_bus.publish(
            "message",
            {
                "room_id": room_id,
                "action": "match_ended",
                "phase": Phase.finished.value,
                "is_ai": False,
            },
        )

    try:
        await finish_session(
            room_id,
            winning_team=str(report["winning_team"]),
            brig_agents=list(report["brig_agents"]),
            survived_agents=list(report["survived_agents"]),
        )
    except Exception:
        logger.exception("finalize_match finish_session failed room=%s", room_id)

    logger.info(
        "match finalized room=%s team=%s synthetics_in_convoy=%s retry=%s",
        room_id,
        report["winning_team"],
        report["synthetics_in_convoy"],
        already_finished,
    )
    return await redis_store.get_room(room_id)
