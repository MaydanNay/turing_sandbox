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
from app.schemas import Phase, RoomState
from app.services.helixa_adapter import canonical_agent_id, report_match_outcome

logger = logging.getLogger(__name__)


def _derive_winning_team(
    *,
    winning_team: str | None,
    winner_id: str | None,
    phase: Phase | None,
) -> str:
    if winning_team and winning_team.strip():
        return winning_team.strip().upper()
    if winner_id:
        # Explicit winner from client — treat as human-officer victory
        return "HUMAN"
    if phase in (Phase.resolve, Phase.finished):
        return "DRAW"
    return "ABORTED"


def _ai_canonical_ids(state: RoomState | None) -> list[str]:
    if state is None:
        return []
    player_ids = list(state.players.keys())
    out: list[str] = []
    for client_id, player in state.players.items():
        if not player.is_ai:
            continue
        out.append(canonical_agent_id(player_ids, client_id))
    return out


def build_match_outcome(
    state: RoomState | None,
    *,
    winning_team: str | None = None,
    winner_id: str | None = None,
    brig_agents: list[str] | None = None,
    survived_agents: list[str] | None = None,
) -> tuple[str, list[str], list[str]]:
    """Return (winning_team, survived_agents, brig_agents) for Helixa resolve."""
    team = _derive_winning_team(
        winning_team=winning_team,
        winner_id=winner_id,
        phase=state.phase if state else None,
    )
    brig = [str(x) for x in (brig_agents or []) if str(x).strip()]
    brig_set = set(brig)

    if survived_agents is not None:
        survived = [str(x) for x in survived_agents if str(x).strip()]
    else:
        survived = [a for a in _ai_canonical_ids(state) if a not in brig_set]

    return team, survived, brig


async def finish_session(
    room_id: str,
    *,
    winner_id: str | None = None,
    session_id: uuid.UUID | None = None,
    winning_team: str | None = None,
    brig_agents: list[str] | None = None,
    survived_agents: list[str] | None = None,
) -> tuple[uuid.UUID, int]:
    state = await redis_store.get_room(room_id)

    # Snapshot outcome before room is deleted
    outcome_team, outcome_survived, outcome_brig = build_match_outcome(
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

    events = await redis_store.pop_all_events(room_id) if state is not None else []
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
    return sid, persisted
