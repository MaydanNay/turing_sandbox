"""REST endpoints for session lifecycle."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import GameEvent, GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import (
    MATCH_DURATION_CHOICES,
    Phase,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetail,
    SessionEventItem,
    SessionEventsResponse,
    SessionFinishRequest,
    SessionFinishResponse,
    SessionJoinRequest,
    SessionSummary,
    room_state_for_client,
)
from app.services import finish_session

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


def _ws_url(request: Request, room_id: str) -> str:
    host = request.headers.get("host", "localhost:8000")
    scheme = "wss" if request.url.scheme == "https" else "ws"
    return f"{scheme}://{host}/ws/room/{room_id}/{{client_id}}"


@router.post("", response_model=SessionCreateResponse)
async def create_session(
    request: Request,
    body: SessionCreateRequest = Body(default_factory=SessionCreateRequest),
    db: AsyncSession = Depends(get_db),
) -> SessionCreateResponse:
    import time

    minutes = int(body.match_duration_minutes)
    if minutes not in MATCH_DURATION_CHOICES:
        raise HTTPException(
            status_code=400,
            detail=f"match_duration_minutes must be one of {list(MATCH_DURATION_CHOICES)}",
        )

    from app.config import settings
    from app.services.matchmaking import find_open_matchmaking_room, reserve_lobby_seat

    if body.private:
        session = GameSession(id=uuid.uuid4(), status=SessionStatus.active)
        db.add(session)
        await db.commit()
        await db.refresh(session)

        room_id = str(session.id)
        invite_code = await redis_store.allocate_invite_code(room_id)
        await redis_store.ensure_room(
            room_id,
            session_id=str(session.id),
            match_duration_minutes=minutes,
            matchmaking_deadline_ts=None,
            is_private=True,
            invite_code=invite_code,
        )
        seat_token = await reserve_lobby_seat(room_id)
        if seat_token is None:
            raise HTTPException(status_code=503, detail="Could not reserve seat")
        return SessionCreateResponse(
            session_id=session.id,
            room_id=room_id,
            status=session.status.value,
            ws_url=_ws_url(request, room_id),
            match_duration_minutes=minutes,
            invite_code=invite_code,
            is_private=True,
            seat_token=seat_token,
        )

    existing = await find_open_matchmaking_room(minutes)
    if existing is not None and existing.session_id:
        room_id = existing.room_id
        seat_token = await reserve_lobby_seat(room_id)
        if seat_token is None:
            # Race: room filled between find and reserve — fall through to new room
            existing = None
        else:
            return SessionCreateResponse(
                session_id=uuid.UUID(existing.session_id),
                room_id=room_id,
                status=SessionStatus.active.value,
                ws_url=_ws_url(request, room_id),
                match_duration_minutes=minutes,
                is_private=False,
                seat_token=seat_token,
            )

    session = GameSession(id=uuid.uuid4(), status=SessionStatus.active)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    room_id = str(session.id)
    deadline = time.time() + float(settings.matchmaking_seconds)
    await redis_store.ensure_room(
        room_id,
        session_id=str(session.id),
        match_duration_minutes=minutes,
        matchmaking_deadline_ts=deadline,
        is_private=False,
    )
    seat_token = await reserve_lobby_seat(room_id)
    if seat_token is None:
        raise HTTPException(status_code=503, detail="Could not reserve seat")

    return SessionCreateResponse(
        session_id=session.id,
        room_id=room_id,
        status=session.status.value,
        ws_url=_ws_url(request, room_id),
        match_duration_minutes=minutes,
        is_private=False,
        seat_token=seat_token,
    )


@router.post("/join", response_model=SessionCreateResponse)
async def join_session_by_invite(
    request: Request,
    body: SessionJoinRequest,
) -> SessionCreateResponse:
    from app.services.matchmaking import find_room_by_invite, reserve_lobby_seat

    code = body.invite_code.strip().upper()
    state = await find_room_by_invite(code)
    if state is None:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if state.phase != Phase.init or state.roles_assigned:
        raise HTTPException(status_code=409, detail="Match already started")
    if not state.session_id:
        raise HTTPException(status_code=500, detail="Room has no session")

    seat_token = await reserve_lobby_seat(state.room_id)
    if seat_token is None:
        raise HTTPException(status_code=409, detail="Room is full")

    return SessionCreateResponse(
        session_id=uuid.UUID(state.session_id),
        room_id=state.room_id,
        status=SessionStatus.active.value,
        ws_url=_ws_url(request, state.room_id),
        match_duration_minutes=state.match_duration_minutes,
        invite_code=state.invite_code,
        is_private=True,
        seat_token=seat_token,
    )


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    status: str | None = Query(default=None, description="active | finished"),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[SessionSummary]:
    events_count = (
        select(GameEvent.session_id, func.count(GameEvent.id).label("cnt"))
        .group_by(GameEvent.session_id)
        .subquery()
    )

    stmt = (
        select(GameSession, func.coalesce(events_count.c.cnt, 0))
        .outerjoin(events_count, GameSession.id == events_count.c.session_id)
        .order_by(GameSession.created_at.desc())
        .limit(limit)
    )

    if status:
        try:
            status_enum = SessionStatus(status)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Use: {[s.value for s in SessionStatus]}",
            ) from exc
        stmt = stmt.where(GameSession.status == status_enum)

    result = await db.execute(stmt)
    rows = result.all()

    summaries: list[SessionSummary] = []
    for session, count in rows:
        room_id = str(session.id)
        redis_alive = await redis_store.get_room(room_id) is not None
        resumable = session.status == SessionStatus.active and redis_alive
        summaries.append(
            SessionSummary(
                session_id=session.id,
                room_id=room_id,
                created_at=session.created_at,
                status=session.status.value,
                winner_id=session.winner_id,
                events_count=int(count),
                resumable=resumable,
            )
        )
    return summaries


@router.get("/{room_id}", response_model=SessionDetail)
async def get_session(
    room_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionDetail:
    try:
        sid = uuid.UUID(room_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid room_id") from exc

    result = await db.execute(select(GameSession).where(GameSession.id == sid))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    count_result = await db.execute(
        select(func.count(GameEvent.id)).where(GameEvent.session_id == sid)
    )
    events_count = int(count_result.scalar_one())

    room = await redis_store.get_room(room_id)
    redis_alive = room is not None
    resumable = session.status == SessionStatus.active and redis_alive

    return SessionDetail(
        session_id=session.id,
        room_id=room_id,
        created_at=session.created_at,
        status=session.status.value,
        winner_id=session.winner_id,
        events_count=events_count,
        resumable=resumable,
        phase=room.phase.value if room else None,
    )


@router.get("/{room_id}/events", response_model=SessionEventsResponse)
async def get_session_events(
    room_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionEventsResponse:
    try:
        sid = uuid.UUID(room_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid room_id") from exc

    result = await db.execute(select(GameSession).where(GameSession.id == sid))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == SessionStatus.finished:
        ev_result = await db.execute(
            select(GameEvent)
            .where(GameEvent.session_id == sid)
            .order_by(GameEvent.timestamp.asc())
        )
        rows = ev_result.scalars().all()
        events = [
            SessionEventItem(
                id=str(ev.id),
                timestamp=ev.timestamp,
                user_id=ev.user_id,
                is_ai=ev.is_ai,
                action_type=ev.action_type,
                raw_payload=ev.raw_payload or {},
            )
            for ev in rows
        ]
        return SessionEventsResponse(
            session_id=sid,
            room_id=room_id,
            source="postgres",
            events=events,
        )

    # Active: serve from Redis buffer if present
    room = await redis_store.get_room(room_id)
    if room is None:
        return SessionEventsResponse(
            session_id=sid,
            room_id=room_id,
            source="redis",
            events=[],
        )

    raw_events = await redis_store.list_events(room_id)
    events = [
        SessionEventItem(
            id=None,
            timestamp=ev.get("timestamp"),
            user_id=str(ev.get("user_id", "unknown")),
            is_ai=bool(ev.get("is_ai", False)),
            action_type=str(ev.get("action_type", "chat")),
            raw_payload=ev.get("raw_payload") or ev,
        )
        for ev in raw_events
    ]
    return SessionEventsResponse(
        session_id=sid,
        room_id=room_id,
        source="redis",
        events=events,
    )


@router.post("/{room_id}/finish", response_model=SessionFinishResponse)
async def finish_room_session(
    room_id: str,
    body: SessionFinishRequest | None = None,
) -> SessionFinishResponse:
    body = body or SessionFinishRequest()
    try:
        sid, count, outcome_team = await finish_session(
            room_id,
            winner_id=body.winner_id,
            winning_team=body.winning_team,
            brig_agents=body.brig_agents,
            survived_agents=body.survived_agents,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return SessionFinishResponse(
        session_id=sid,
        status=SessionStatus.finished.value,
        events_persisted=count,
        winner_id=body.winner_id,
        winning_team=outcome_team,
    )


@router.get("/{room_id}/state")
async def get_room_state(room_id: str) -> dict:
    state = await redis_store.get_room(room_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room_state_for_client(state)
