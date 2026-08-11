"""Server-driven match phase clock: deadlines + auto-advance."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.connection_manager import manager
from app.event_bus import event_bus
from app.redis_state import redis_store
from app.schemas import MATCH_DURATION_CHOICES, Phase, RoomState, room_state_for_client

logger = logging.getLogger(__name__)

# Keep in sync with frontend/src/data/gamePhaseConfig.ts
MATCH_PHASE_ORDER: list[Phase] = [
    Phase.init,
    Phase.pitch,
    Phase.recess,
    Phase.conflict,
    Phase.revision,
    Phase.turing,
    Phase.resolve,
]

BASE_DURATION_SECONDS: dict[Phase, float] = {
    Phase.init: 60,
    Phase.pitch: 7 * 60,
    Phase.recess: 5 * 60,
    Phase.conflict: 7 * 60,
    Phase.revision: 6 * 60,
    Phase.turing: 5 * 60,
    Phase.vote: 60,
    # Overridden in duration_seconds via settings.convoy_boarding_seconds
    Phase.resolve: 180,
    Phase.finished: 0,
}

# Design length of outpost phases (Init → Turing), used for match presets
DESIGN_PRE_RESOLVE_SECONDS: float = sum(
    BASE_DURATION_SECONDS[p]
    for p in (
        Phase.init,
        Phase.pitch,
        Phase.recess,
        Phase.conflict,
        Phase.revision,
        Phase.turing,
    )
)

ALLOWED_MATCH_DURATIONS = frozenset(MATCH_DURATION_CHOICES)

# Floor so scaled timers still advance during local/dev testing
_MIN_PHASE_SECONDS = 8.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def phase_scale_for_room(state: RoomState | None) -> float:
    """Per-room scale from match_duration_minutes, else global PHASE_DURATION_SCALE."""
    if state is not None and state.match_duration_minutes in ALLOWED_MATCH_DURATIONS:
        target = float(state.match_duration_minutes) * 60.0
        return target / max(1.0, DESIGN_PRE_RESOLVE_SECONDS)
    return float(settings.phase_duration_scale)


def duration_seconds(phase: Phase, state: RoomState | None = None) -> float:
    if phase == Phase.resolve:
        base = float(settings.convoy_boarding_seconds)
        if base <= 0:
            return 0.0
        # Preset rooms: full boarding window. Legacy rooms: global scale.
        if state is not None and state.match_duration_minutes in ALLOWED_MATCH_DURATIONS:
            return max(_MIN_PHASE_SECONDS, base)
        return max(_MIN_PHASE_SECONDS, base * float(settings.phase_duration_scale))

    base = BASE_DURATION_SECONDS.get(phase, 60.0)
    if base <= 0:
        return 0.0
    scaled = base * phase_scale_for_room(state)
    return max(_MIN_PHASE_SECONDS, scaled)


def next_phase(phase: Phase) -> Phase | None:
    if phase == Phase.finished:
        return None
    if phase == Phase.vote:
        return Phase.resolve
    try:
        idx = MATCH_PHASE_ORDER.index(phase)
    except ValueError:
        return Phase.finished
    if idx + 1 >= len(MATCH_PHASE_ORDER):
        return Phase.finished
    return MATCH_PHASE_ORDER[idx + 1]


async def _broadcast_phase_changed(
    room_id: str,
    state: RoomState,
    *,
    triggered_by: str | None,
) -> None:
    out: dict[str, Any] = {
        "type": "phase_changed",
        "room_id": room_id,
        "client_id": triggered_by,
        "phase": state.phase.value,
        "state": room_state_for_client(state),
        "ts": _now_iso(),
    }
    await manager.broadcast(room_id, out)
    await redis_store.append_event(
        room_id,
        {
            "user_id": triggered_by or "system",
            "is_ai": False,
            "action_type": "phase",
            "raw_payload": out,
            "timestamp": out["ts"],
        },
    )
    await event_bus.publish(
        "message",
        {
            "room_id": room_id,
            "action": "phase_changed",
            "phase": state.phase.value,
            "is_ai": False,
        },
    )


async def apply_phase(
    room_id: str,
    new_phase: Phase,
    *,
    triggered_by: str | None = None,
    broadcast: bool = True,
) -> RoomState:
    """Set phase + deadline and optionally broadcast to the room."""
    now = time.time()
    # Need current room for per-match duration preset
    prior = await redis_store.get_room(room_id)
    dur = duration_seconds(new_phase, prior)
    deadline: float | None
    if new_phase == Phase.finished or dur <= 0:
        deadline = None
    else:
        deadline = now + dur

    state = await redis_store.set_phase(room_id, new_phase, deadline)
    from app.services.match_flow import on_phase_enter

    state = await on_phase_enter(room_id, state)
    logger.info(
        "phase room=%s -> %s deadline=%s by=%s",
        room_id,
        state.phase.value,
        state.phase_deadline_ts,
        triggered_by,
    )
    if broadcast:
        await _broadcast_phase_changed(room_id, state, triggered_by=triggered_by)
    return state


async def ensure_deadline(
    room_id: str,
    *,
    triggered_by: str = "system:ensure_deadline",
) -> RoomState | None:
    """If the room is in an active phase without a deadline, start the clock."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return None
    if state.phase == Phase.finished:
        return state
    if state.phase_deadline_ts is not None:
        return state
    return await apply_phase(room_id, state.phase, triggered_by=triggered_by)


async def start_match_from_init(room_id: str) -> RoomState | None:
    """Roles assigned: leave Init → Pitch with a live deadline."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return None
    if state.phase == Phase.init:
        return await apply_phase(
            room_id, Phase.pitch, triggered_by="system:roles_assigned"
        )
    if state.phase_deadline_ts is None:
        return await ensure_deadline(room_id, triggered_by="system:roles_assigned")
    return state


async def tick_room(room_id: str) -> RoomState | None:
    """Advance reveal/vote flow; when phase deadline passes, resolve then next phase."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return None
    # Partial finalize left Redis in Finished — retry persist/cleanup
    if state.phase == Phase.finished:
        from app.services.match_epilogue import finalize_match

        return await finalize_match(room_id)

    # Matchmaking: wait for humans, then fill AI and start
    if state.phase == Phase.init and not state.roles_assigned:
        from app.services.matchmaking import try_finish_matchmaking

        return await try_finish_matchmaking(room_id)

    # Backfill deadline for rooms that jumped phase without a clock
    if state.phase_deadline_ts is None:
        if state.roles_assigned or state.phase != Phase.init:
            return await ensure_deadline(room_id)
        return state

    from app.services.match_flow import (
        VOTE_PHASES,
        autofill_bot_votes,
        resolve_votes,
        tick_match_flow,
    )

    state = await tick_match_flow(room_id, state)

    # A+B: Карцер полный во время посадки → Конвой уезжает сразу
    if (
        state.phase == Phase.resolve
        and len(state.brig_character_ids) >= settings.brig_capacity
    ):
        from app.services.match_epilogue import finalize_match

        return await finalize_match(room_id)

    if time.time() < (state.phase_deadline_ts or 0):
        return state

    # Boarding window over → convoy audit (everyone not in brig boards)
    if state.phase == Phase.resolve:
        from app.services.match_epilogue import finalize_match

        if state.vote_open or state.votes:
            state = await resolve_votes(room_id, state)
        return await finalize_match(room_id)

    # End of vote-capable phase: never skip the window if the tick jumped over it
    if state.phase in VOTE_PHASES:
        if not state.vote_open:
            state.vote_open = True
            state.votes = state.votes or {}
            await redis_store.save_room(state)
            state = await autofill_bot_votes(room_id, state)
        state = await resolve_votes(room_id, state)
    elif state.vote_open or state.votes:
        state = await resolve_votes(room_id, state)

    nxt = next_phase(state.phase)
    if nxt is None:
        return state
    return await apply_phase(room_id, nxt, triggered_by="system:scheduler")


async def _scheduler_loop() -> None:
    interval = max(0.5, float(settings.phase_scheduler_interval_seconds))
    logger.info(
        "Phase scheduler started (interval=%.1fs scale=%.3f)",
        interval,
        settings.phase_duration_scale,
    )
    while True:
        try:
            room_ids = set(await redis_store.list_room_ids())
            room_ids.update(getattr(manager, "_rooms", {}).keys())
            for room_id in room_ids:
                try:
                    await tick_room(room_id)
                except Exception:
                    logger.exception("phase tick failed room=%s", room_id)
        except Exception:
            logger.exception("phase scheduler loop failed")

        await asyncio.sleep(interval)


def start_phase_scheduler() -> asyncio.Task[None]:
    return asyncio.create_task(_scheduler_loop(), name="phase-scheduler")
