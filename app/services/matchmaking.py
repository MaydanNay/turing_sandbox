"""Matchmaking: wait for humans, then fill AI seats and start the match."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from app.config import settings
from app.connection_manager import manager
from app.event_bus import event_bus
from app.redis_state import redis_store
from app.schemas import Phase, RoomState, room_state_for_client

logger = logging.getLogger(__name__)

_MM_LOCK_KEY = "bunker:mm_lock:{room_id}"
_SEAT_LOCK_KEY = "bunker:seat_lock:{room_id}"
_HOLDS_ZSET = "bunker:room:{room_id}:holds"
_HOLD_KEY = "bunker:seat_hold:{token}"
_HOLD_TTL_SECONDS = 120

SeatClaimStatus = Literal["ok", "full", "started", "missing", "bad_token"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def count_connected_humans(state: RoomState) -> int:
    """Humans currently online (matchmaking full / UI)."""
    return sum(
        1
        for p in state.players.values()
        if not p.is_ai and p.connected and p.is_alive
    )


def count_alive_humans(state: RoomState) -> int:
    """Humans holding a seat (incl. soft-disconnect / reconnect)."""
    return sum(1 for p in state.players.values() if not p.is_ai and p.is_alive)


async def _acquire_seat_lock(room_id: str, *, attempts: int = 40) -> bool:
    key = _SEAT_LOCK_KEY.format(room_id=room_id)
    for _ in range(attempts):
        ok = await redis_store.redis.set(key, "1", nx=True, ex=5)
        if ok:
            return True
        await asyncio.sleep(0.025)
    return False


async def _release_seat_lock(room_id: str) -> None:
    await redis_store.redis.delete(_SEAT_LOCK_KEY.format(room_id=room_id))


async def _prune_expired_holds(room_id: str) -> int:
    """Drop expired hold tokens; return remaining pending count."""
    zkey = _HOLDS_ZSET.format(room_id=room_id)
    now = time.time()
    await redis_store.redis.zremrangebyscore(zkey, "-inf", now)
    return int(await redis_store.redis.zcard(zkey) or 0)


async def reserve_lobby_seat(room_id: str) -> str | None:
    """
    Atomically reserve a lobby seat until WS claims it (or TTL).
    Returns seat_token, or None if room is full / not joinable.
    """
    if not await _acquire_seat_lock(room_id):
        return None
    try:
        state = await redis_store.get_room(room_id)
        if state is None:
            return None
        if state.phase != Phase.init or state.roles_assigned:
            return None

        pending = await _prune_expired_holds(room_id)
        alive = count_alive_humans(state)
        if alive + pending >= settings.room_capacity:
            return None

        token = uuid.uuid4().hex
        expires = time.time() + _HOLD_TTL_SECONDS
        pipe = redis_store.redis.pipeline()
        pipe.set(
            _HOLD_KEY.format(token=token),
            room_id,
            ex=_HOLD_TTL_SECONDS,
        )
        pipe.zadd(_HOLDS_ZSET.format(room_id=room_id), {token: expires})
        pipe.expire(
            _HOLDS_ZSET.format(room_id=room_id),
            settings.room_ttl_seconds or 86400,
        )
        await pipe.execute()
        logger.info(
            "seat reserved room=%s alive=%s pending=%s token=%s",
            room_id,
            alive,
            pending + 1,
            token[:8],
        )
        return token
    finally:
        await _release_seat_lock(room_id)


async def _consume_hold_token(room_id: str, token: str) -> bool:
    hold_key = _HOLD_KEY.format(token=token)
    raw = await redis_store.redis.get(hold_key)
    if raw is None or str(raw) != room_id:
        return False
    pipe = redis_store.redis.pipeline()
    pipe.delete(hold_key)
    pipe.zrem(_HOLDS_ZSET.format(room_id=room_id), token)
    await pipe.execute()
    return True


async def clear_lobby_holds(room_id: str) -> None:
    zkey = _HOLDS_ZSET.format(room_id=room_id)
    tokens = await redis_store.redis.zrange(zkey, 0, -1)
    if tokens:
        pipe = redis_store.redis.pipeline()
        for t in tokens:
            pipe.delete(_HOLD_KEY.format(token=str(t)))
        pipe.delete(zkey)
        await pipe.execute()


async def claim_lobby_seat(
    room_id: str,
    client_id: str,
    seat_token: str | None = None,
) -> tuple[SeatClaimStatus, RoomState | None, bool]:
    """
    Claim a human lobby seat under a Redis lock.
    Returns (status, state, is_reconnect).
    Reconnect of an alive player does not need a token.
    New players should pass seat_token from create/join.
    """
    if not await _acquire_seat_lock(room_id):
        return "full", await redis_store.get_room(room_id), False

    try:
        state = await redis_store.get_room(room_id)
        if state is None:
            return "missing", None, False

        existing = state.players.get(client_id)
        if existing is not None and existing.is_alive:
            state = await redis_store.upsert_player(
                room_id, client_id, is_ai=False, connected=True
            )
            if state.is_private and not state.roles_assigned:
                if ensure_host(state, preferred_client_id=client_id):
                    await redis_store.save_room(state)
                    state = await redis_store.get_room(room_id) or state
            return "ok", state, True

        if state.phase != Phase.init or state.roles_assigned:
            return "started", state, False

        token = (seat_token or "").strip()
        if not token:
            return "bad_token", state, False
        if not await _consume_hold_token(room_id, token):
            return "bad_token", state, False

        if count_alive_humans(state) >= settings.room_capacity:
            return "full", state, False

        state = await redis_store.upsert_player(
            room_id, client_id, is_ai=False, connected=True
        )
        if state.is_private and not state.roles_assigned:
            if ensure_host(state, preferred_client_id=client_id):
                await redis_store.save_room(state)
                state = await redis_store.get_room(room_id) or state
        return "ok", state, False
    finally:
        await _release_seat_lock(room_id)


async def find_open_matchmaking_room(match_duration_minutes: int) -> RoomState | None:
    """Find public Init room still searching with the same duration preset and free seats."""
    now = time.time()
    for room_id in await redis_store.list_room_ids():
        state = await redis_store.get_room(room_id)
        if state is None:
            continue
        if state.is_private:
            continue
        if state.phase != Phase.init or state.roles_assigned:
            continue
        if state.match_duration_minutes != match_duration_minutes:
            continue
        deadline = state.matchmaking_deadline_ts
        if deadline is None or deadline <= now:
            continue
        pending = await _prune_expired_holds(room_id)
        if count_alive_humans(state) + pending >= settings.room_capacity:
            continue
        return state
    return None


async def find_room_by_invite(invite_code: str) -> RoomState | None:
    room_id = await redis_store.resolve_invite_code(invite_code)
    if not room_id:
        return None
    state = await redis_store.get_room(room_id)
    if state is None:
        return None
    if not state.is_private or not state.invite_code:
        return None
    if state.invite_code.upper() != invite_code.strip().upper():
        return None
    return state


def ensure_host(state: RoomState, preferred_client_id: str | None = None) -> bool:
    """
    Assign / repair host_client_id. Returns True if state mutated.

    Soft-disconnect does NOT drop host — only missing / abandoned / AI host does.
    """
    if not state.is_private:
        return False

    def _host_holds_seat(cid: str | None) -> bool:
        if not cid:
            return False
        p = state.players.get(cid)
        return bool(p and not p.is_ai and p.is_alive)

    if _host_holds_seat(state.host_client_id):
        return False

    if preferred_client_id and _host_holds_seat(preferred_client_id):
        state.host_client_id = preferred_client_id
        return True

    for p in state.players.values():
        if not p.is_ai and p.is_alive:
            state.host_client_id = p.client_id
            return True

    state.host_client_id = None
    return True


async def prune_abandoned_lobby_players(room_id: str) -> RoomState | None:
    """Remove dead humans before seating bots / roles (Init only)."""
    state = await redis_store.get_room(room_id)
    if state is None or state.roles_assigned or state.phase != Phase.init:
        return state
    drop = [cid for cid, p in state.players.items() if not p.is_ai and not p.is_alive]
    if not drop:
        return state
    for cid in drop:
        del state.players[cid]
    if state.host_client_id in drop:
        ensure_host(state)
    await redis_store.save_room(state)
    logger.info("pruned abandoned lobby players room=%s drop=%s", room_id, drop)
    return state


async def try_finish_matchmaking(
    room_id: str,
    *,
    force: bool = False,
) -> RoomState | None:
    """
    Close lobby and start match when:
    - public: timeout or full humans (or force)
    - private: host start (force) or full humans
    """
    state = await redis_store.get_room(room_id)
    if state is None:
        return None
    if state.phase != Phase.init or state.roles_assigned:
        return state

    humans = count_connected_humans(state)
    full = humans >= settings.room_capacity

    if state.is_private:
        if not force and not full:
            return state
    else:
        deadline = state.matchmaking_deadline_ts
        timed_out = deadline is not None and time.time() >= deadline
        if not force and not full and not timed_out:
            return state

    lock_key = _MM_LOCK_KEY.format(room_id=room_id)
    got_lock = await redis_store.redis.set(lock_key, "1", nx=True, ex=30)
    if not got_lock:
        return await redis_store.get_room(room_id)

    try:
        state = await redis_store.get_room(room_id)
        if state is None:
            return None
        if state.phase != Phase.init or state.roles_assigned:
            return state

        logger.info(
            "matchmaking close room=%s private=%s humans=%s full=%s force=%s",
            room_id,
            state.is_private,
            count_connected_humans(state),
            full,
            force,
        )

        await prune_abandoned_lobby_players(room_id)
        await clear_lobby_holds(room_id)

        from app.mock_agent import ensure_mock_agents

        await ensure_mock_agents(room_id)
        state = await redis_store.get_room(room_id)
        if state is None:
            return None

        if state.roles_assigned and state.matchmaking_deadline_ts is not None:
            state.matchmaking_deadline_ts = None
            await redis_store.save_room(state)

        out: dict[str, Any] = {
            "type": "state",
            "room_id": room_id,
            "client_id": "system:matchmaking",
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        }
        await manager.broadcast(room_id, out)
        await event_bus.publish(
            "message",
            {
                "room_id": room_id,
                "action": "matchmaking_closed",
                "phase": state.phase.value,
                "is_ai": False,
            },
        )
        return state
    finally:
        await redis_store.redis.delete(lock_key)
