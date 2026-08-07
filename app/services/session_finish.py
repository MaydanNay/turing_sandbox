"""Persist Redis room event buffer into PostgreSQL and finish the session."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.mock_agent import stop_room_bots
from app.models import GameEvent, GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import Faction, Phase, RoomState
from app.services.helixa_adapter import canonical_agent_id, report_match_outcome

logger = logging.getLogger(__name__)


def _brig_covers_player(player_keys: set[str], brig_set: set[str]) -> bool:
    return bool(player_keys & brig_set)


def _synthetic_player_keys(state: RoomState) -> list[set[str]]:
    """Each synthetic as a set of ids that may appear in brig_agents (character / client)."""
    player_ids = list(state.players.keys())
    groups: list[set[str]] = []
    for client_id, player in state.players.items():
        if player.faction != Faction.synthetic:
            continue
        keys = {client_id}
        if player.character_id:
            keys.add(player.character_id)
        keys.add(
            canonical_agent_id(
                player_ids,
                client_id,
                character_id=player.character_id,
            )
        )
        groups.append(keys)
    return groups


def _all_synthetics_in_brig(state: RoomState | None, brig_set: set[str]) -> bool:
    if state is None or not brig_set:
        return False
    groups = _synthetic_player_keys(state)
    if not groups:
        return False
    return all(_brig_covers_player(keys, brig_set) for keys in groups)


def _derive_winning_team(
    *,
    state: RoomState | None,
    winning_team: str | None,
    winner_id: str | None,
    phase: Phase | None,
    brig_set: set[str],
) -> str:
    """
    Prefer faction ground truth: all SYNTHETIC in brig → HUMAN (even if client sent ABORTED).
    Early leave without that → ABORTED. Resolve / conscious end without full brig → SYNTHETICS.
    """
    if _all_synthetics_in_brig(state, brig_set):
        return "HUMAN"

    client = (winning_team or "").strip().upper()
    early_leave = client in ("", "ABORTED") and phase not in (
        Phase.resolve,
        Phase.finished,
    )

    if early_leave:
        if winner_id:
            return "HUMAN"
        return "ABORTED"

    if client == "HUMAN":
        return "HUMAN"
    if client == "ABORTED":
        return "ABORTED"

    # Resolve / DRAW / explicit end without all synthetics locked
    if client in ("DRAW", "SYNTHETICS") or phase in (Phase.resolve, Phase.finished):
        return "SYNTHETICS"

    if client:
        return client
    return "ABORTED"


def _ai_canonical_ids(state: RoomState | None) -> list[str]:
    if state is None:
        return []
    player_ids = list(state.players.keys())
    out: list[str] = []
    for client_id, player in state.players.items():
        if not player.is_ai:
            continue
        out.append(
            canonical_agent_id(
                player_ids,
                client_id,
                character_id=player.character_id,
            )
        )
    return out


def _faction_map(state: RoomState | None) -> dict[str, str]:
    """canonical agent_id / client_id → HUMAN|SYNTHETIC for dataset resolve."""
    if state is None:
        return {}
    player_ids = list(state.players.keys())
    out: dict[str, str] = {}
    for client_id, player in state.players.items():
        if player.faction is None:
            continue
        key = canonical_agent_id(
            player_ids,
            client_id,
            character_id=player.character_id,
        )
        out[key] = player.faction.value
    return out


def build_match_outcome(
    state: RoomState | None,
    *,
    winning_team: str | None = None,
    winner_id: str | None = None,
    brig_agents: list[str] | None = None,
    survived_agents: list[str] | None = None,
) -> tuple[str, list[str], list[str], dict[str, str]]:
    """Return (winning_team, survived_agents, brig_agents, agent_factions)."""
    brig = [str(x) for x in (brig_agents or []) if str(x).strip()]
    brig_set = set(brig)
    team = _derive_winning_team(
        state=state,
        winning_team=winning_team,
        winner_id=winner_id,
        phase=state.phase if state else None,
        brig_set=brig_set,
    )

    if survived_agents is not None:
        survived = [str(x) for x in survived_agents if str(x).strip()]
    else:
        survived = [a for a in _ai_canonical_ids(state) if a not in brig_set]

    return team, survived, brig, _faction_map(state)


async def finish_session(
    room_id: str,
    *,
    winner_id: str | None = None,
    session_id: uuid.UUID | None = None,
    winning_team: str | None = None,
    brig_agents: list[str] | None = None,
    survived_agents: list[str] | None = None,
) -> tuple[uuid.UUID, int, str]:
    state = await redis_store.get_room(room_id)

    # Snapshot outcome before room is deleted
    outcome_team, outcome_survived, outcome_brig, outcome_factions = build_match_outcome(
        state,
        winning_team=winning_team,
        winner_id=winner_id,
        brig_agents=brig_agents,
        survived_agents=survived_agents,
    )

    sid = session_id
    if sid is None and state and state.session_id:
        sid = uuid.UUID(state.session_id)
    if sid is None:
        try:
            sid = uuid.UUID(room_id)
        except ValueError as exc:
            raise ValueError("session_id is required to finish") from exc

    events = await redis_store.list_events(room_id, limit=0) if state is not None else []
    persisted = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(GameSession).where(GameSession.id == sid))
        session = result.scalar_one_or_none()
        if session is None:
            session = GameSession(id=sid, status=SessionStatus.active)
            db.add(session)

        session.status = SessionStatus.finished
        session.winner_id = winner_id

        for ev in events:
            ts_raw = ev.get("timestamp")
            if isinstance(ts_raw, str):
                try:
                    ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                except ValueError:
                    ts = datetime.now(timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            db.add(
                GameEvent(
                    session_id=sid,
                    timestamp=ts,
                    user_id=str(ev.get("user_id", "unknown")),
                    is_ai=bool(ev.get("is_ai", False)),
                    action_type=str(ev.get("action_type", "chat")),
                    raw_payload=ev.get("raw_payload") or ev,
                )
            )
            persisted += 1

        await db.commit()

    if state is not None:
        await redis_store.set_phase(room_id, Phase.finished)
    await stop_room_bots(room_id)
    await redis_store.delete_room(room_id)

    # Fire-and-forget: must not delay HTTP 200 to the player
    match_id = str(sid)
    asyncio.create_task(
        report_match_outcome(
            match_id,
            outcome_team,
            outcome_survived,
            outcome_brig,
            agent_factions=outcome_factions,
        ),
        name=f"helixa-resolve:{match_id}",
    )

    logger.info(
        "Session finished session=%s room=%s events=%s winner=%s team=%s",
        sid,
        room_id,
        persisted,
        winner_id,
        outcome_team,
    )
    return sid, persisted, outcome_team
