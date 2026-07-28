"""Persist Redis room event buffer into PostgreSQL and finish the session."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import AsyncSessionLocal
from app.mock_agent import stop_room_bots
from app.models import GameEvent, GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import Phase

logger = logging.getLogger(__name__)


async def finish_session(
    room_id: str,
    *,
    winner_id: str | None = None,
    session_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, int]:
    state = await redis_store.get_room(room_id)
    if state is None and session_id is None:
        raise ValueError(f"Room {room_id} not found")

    sid = session_id or (uuid.UUID(state.session_id) if state and state.session_id else None)
    if sid is None:
        raise ValueError("session_id is required to finish")

    events = await redis_store.pop_all_events(room_id)
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

    await redis_store.set_phase(room_id, Phase.finished)
    await stop_room_bots(room_id)
    await redis_store.delete_room(room_id)

    logger.info(
        "Session finished session=%s room=%s events=%s winner=%s",
        sid,
        room_id,
        persisted,
        winner_id,
    )
    return sid, persisted
