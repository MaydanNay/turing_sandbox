"""Redis-backed room state (active game lives here, not in Postgres)."""

from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.config import settings
from app.schemas import Phase, PlayerInfo, RoomState

logger = logging.getLogger(__name__)

ROOM_KEY = "bunker:room:{room_id}"
EVENTS_KEY = "bunker:room:{room_id}:events"
SESSION_KEY = "bunker:session:{session_id}:room"

ROLES = ["Врач", "Инженер", "Повар", "Военный", "Биолог", "Механик"]


class RedisStateStore:
    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None

    async def connect(self) -> None:
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        await self._redis.ping()
        logger.info("Redis connected: %s", settings.redis_url)

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    @property
    def redis(self) -> aioredis.Redis:
        if self._redis is None:
            raise RuntimeError("Redis is not connected")
        return self._redis

    def _room_key(self, room_id: str) -> str:
        return ROOM_KEY.format(room_id=room_id)

    def _events_key(self, room_id: str) -> str:
        return EVENTS_KEY.format(room_id=room_id)

    async def get_room(self, room_id: str) -> RoomState | None:
        raw = await self.redis.get(self._room_key(room_id))
        if not raw:
            return None
        return RoomState.model_validate_json(raw)

    async def save_room(self, state: RoomState) -> None:
        await self.redis.set(self._room_key(state.room_id), state.model_dump_json())
        if state.session_id:
            await self.redis.set(
                SESSION_KEY.format(session_id=state.session_id),
                state.room_id,
            )

    async def ensure_room(self, room_id: str, session_id: str | None = None) -> RoomState:
        state = await self.get_room(room_id)
        if state is not None:
            if session_id and not state.session_id:
                state.session_id = session_id
                await self.save_room(state)
            return state
        state = RoomState(room_id=room_id, session_id=session_id, phase=Phase.init)
        await self.save_room(state)
        return state

    async def upsert_player(
        self,
        room_id: str,
        client_id: str,
        *,
        is_ai: bool = False,
        role: str | None = None,
        connected: bool = True,
    ) -> RoomState:
        state = await self.ensure_room(room_id)
        existing = state.players.get(client_id)
        state.players[client_id] = PlayerInfo(
            client_id=client_id,
            role=role if role is not None else (existing.role if existing else None),
            is_ai=is_ai if existing is None else existing.is_ai or is_ai,
            connected=connected,
        )
        await self.save_room(state)
        return state

    async def mark_disconnected(self, room_id: str, client_id: str) -> RoomState | None:
        state = await self.get_room(room_id)
        if state is None or client_id not in state.players:
            return state
        player = state.players[client_id]
        state.players[client_id] = player.model_copy(update={"connected": False})
        await self.save_room(state)
        return state

    async def set_phase(
        self, room_id: str, phase: Phase, deadline_ts: float | None = None
    ) -> RoomState:
        state = await self.ensure_room(room_id)
        state.phase = phase
        state.phase_deadline_ts = deadline_ts
        await self.save_room(state)
        return state

    async def assign_roles(self, room_id: str) -> RoomState:
        state = await self.ensure_room(room_id)
        if state.roles_assigned:
            return state
        for idx, client_id in enumerate(state.players.keys()):
            role = ROLES[idx % len(ROLES)]
            player = state.players[client_id]
            state.players[client_id] = player.model_copy(update={"role": role})
        state.roles_assigned = True
        if state.phase == Phase.init:
            state.phase = Phase.pitch
        await self.save_room(state)
        return state

    async def append_event(self, room_id: str, event: dict[str, Any]) -> None:
        await self.redis.rpush(self._events_key(room_id), json.dumps(event))

    async def pop_all_events(self, room_id: str) -> list[dict[str, Any]]:
        key = self._events_key(room_id)
        raw_list = await self.redis.lrange(key, 0, -1)
        await self.redis.delete(key)
        events: list[dict[str, Any]] = []
        for raw in raw_list:
            try:
                events.append(json.loads(raw))
            except json.JSONDecodeError:
                logger.warning("skip bad event json room=%s", room_id)
        return events

    async def delete_room(self, room_id: str) -> None:
        state = await self.get_room(room_id)
        keys = [self._room_key(room_id), self._events_key(room_id)]
        if state and state.session_id:
            keys.append(SESSION_KEY.format(session_id=state.session_id))
        await self.redis.delete(*keys)


redis_store = RedisStateStore()
