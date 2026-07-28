"""REST endpoints for session lifecycle."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import SessionCreateResponse, SessionFinishRequest, SessionFinishResponse
from app.services import finish_session

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.post("", response_model=SessionCreateResponse)
async def create_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SessionCreateResponse:
    session = GameSession(id=uuid.uuid4(), status=SessionStatus.active)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    room_id = str(session.id)
    await redis_store.ensure_room(room_id, session_id=str(session.id))

    host = request.headers.get("host", "localhost:8000")
    # Prefer ws for local/MVP; Diana can upgrade to wss behind TLS
    scheme = "wss" if request.url.scheme == "https" else "ws"
    ws_url = f"{scheme}://{host}/ws/room/{room_id}/{{client_id}}"

    return SessionCreateResponse(
        session_id=session.id,
        room_id=room_id,
        status=session.status.value,
        ws_url=ws_url,
    )


@router.post("/{room_id}/finish", response_model=SessionFinishResponse)
async def finish_room_session(
    room_id: str,
    body: SessionFinishRequest | None = None,
) -> SessionFinishResponse:
    body = body or SessionFinishRequest()
    try:
        sid, count = await finish_session(room_id, winner_id=body.winner_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return SessionFinishResponse(
        session_id=sid,
        status=SessionStatus.finished.value,
        events_persisted=count,
        winner_id=body.winner_id,
    )


@router.get("/{room_id}/state")
async def get_room_state(room_id: str) -> dict:
    state = await redis_store.get_room(room_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return state.model_dump(mode="json")
