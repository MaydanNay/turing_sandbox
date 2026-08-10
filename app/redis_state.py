"""Redis-backed room state (active game lives here, not in Postgres)."""

from __future__ import annotations

import json
import logging
import random
from typing import Any

import redis.asyncio as aioredis

from app.config import settings
from app.schemas import Faction, Phase, PlayerInfo, RoomState

logger = logging.getLogger(__name__)

ROOM_KEY = "bunker:room:{room_id}"
EVENTS_KEY = "bunker:room:{room_id}:events"
SESSION_KEY = "bunker:session:{session_id}:room"
INVITE_KEY = "bunker:invite:{code}"
PRIVATE_KEY = "bunker:room:{room_id}:private:{human_id}:{agent_id}"
PRIVATE_PATTERN = "bunker:room:{room_id}:private:*"
HAND_KEY = "bunker:room:{room_id}:hand:{client_id}"
HAND_PATTERN = "bunker:room:{room_id}:hand:*"

# Ambiguous-free invite alphabet
_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

ROLES = [
    "Врач",
    "Инженер",
    "Повар",
    "Военный",
    "Биолог",
    "Механик",
    "Связист",
    "Психолог",
]
# Must match frontend CHARACTERS / Helixa agent personas
CHARACTER_IDS = (
    "vance",
    "cole",
    "martha",
    "penny",
    "gwen",
    "logan",
    "chester",
    "roxy",
)


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

    def _private_key(self, room_id: str, human_id: str, agent_id: str) -> str:
        return PRIVATE_KEY.format(
            room_id=room_id, human_id=human_id, agent_id=agent_id
        )

    async def _touch_ttl(self, room_id: str, session_id: str | None = None) -> None:
        ttl = settings.room_ttl_seconds
        if ttl <= 0:
            return
        keys = [self._room_key(room_id), self._events_key(room_id)]
        if session_id:
            keys.append(SESSION_KEY.format(session_id=session_id))
        for key in keys:
            await self.redis.expire(key, ttl)

    async def _touch_private_ttl(self, room_id: str, *extra_keys: str) -> None:
        ttl = settings.room_ttl_seconds
        if ttl <= 0:
            return
        state = await self.get_room(room_id)
        await self._touch_ttl(room_id, state.session_id if state else None)
        for key in extra_keys:
            await self.redis.expire(key, ttl)

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
        await self._touch_ttl(state.room_id, state.session_id)
        if state.invite_code:
            ttl = settings.room_ttl_seconds
            if ttl > 0:
                await self.redis.expire(self._invite_key(state.invite_code), ttl)
            await self.redis.set(
                self._invite_key(state.invite_code),
                state.room_id,
                ex=ttl if ttl > 0 else None,
            )

    def _invite_key(self, code: str) -> str:
        return INVITE_KEY.format(code=code.upper())

    async def allocate_invite_code(self, room_id: str, *, length: int = 6) -> str:
        """Reserve a short invite code → room_id mapping (TTL follows room)."""
        ttl = settings.room_ttl_seconds
        for _ in range(40):
            code = "".join(random.choice(_INVITE_ALPHABET) for _ in range(length))
            key = self._invite_key(code)
            ok = await self.redis.set(key, room_id, nx=True, ex=ttl if ttl > 0 else None)
            if ok:
                return code
        raise RuntimeError("Could not allocate invite code")

    async def resolve_invite_code(self, code: str) -> str | None:
        raw = await self.redis.get(self._invite_key(code.strip()))
        if raw is None:
            return None
        return str(raw)

    async def ensure_room(
        self,
        room_id: str,
        session_id: str | None = None,
        *,
        match_duration_minutes: int | None = None,
        matchmaking_deadline_ts: float | None = None,
        is_private: bool | None = None,
        invite_code: str | None = None,
        host_client_id: str | None = None,
    ) -> RoomState:
        state = await self.get_room(room_id)
        if state is not None:
            changed = False
            if session_id and not state.session_id:
                state.session_id = session_id
                changed = True
            if (
                match_duration_minutes is not None
                and state.match_duration_minutes is None
            ):
                state.match_duration_minutes = match_duration_minutes
                changed = True
            if (
                matchmaking_deadline_ts is not None
                and state.matchmaking_deadline_ts is None
            ):
                state.matchmaking_deadline_ts = matchmaking_deadline_ts
                changed = True
            if is_private is True and not state.is_private:
                state.is_private = True
                changed = True
            if invite_code and not state.invite_code:
                state.invite_code = invite_code.upper()
                changed = True
            if host_client_id and not state.host_client_id:
                state.host_client_id = host_client_id
                changed = True
            if changed:
                await self.save_room(state)
            else:
                await self._touch_ttl(room_id, state.session_id)
            return state
        state = RoomState(
            room_id=room_id,
            session_id=session_id,
            phase=Phase.init,
            match_duration_minutes=match_duration_minutes,
            matchmaking_deadline_ts=matchmaking_deadline_ts,
            is_private=bool(is_private),
            invite_code=invite_code.upper() if invite_code else None,
            host_client_id=host_client_id,
        )
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
            character_id=existing.character_id if existing else None,
            faction=existing.faction if existing else None,
            is_ai=is_ai if existing is None else existing.is_ai or is_ai,
            connected=connected,
            is_alive=existing.is_alive if existing else True,
        )
        await self.save_room(state)
        return state

    async def mark_disconnected(self, room_id: str, client_id: str) -> RoomState | None:
        """Network drop / socket close: connected=False only. Alive players may reconnect."""
        state = await self.get_room(room_id)
        if state is None or client_id not in state.players:
            return state
        player = state.players[client_id]
        state.players[client_id] = player.model_copy(update={"connected": False})
        await self.save_room(state)
        return state

    async def abandon_player(self, room_id: str, client_id: str) -> RoomState | None:
        """Explicit leave: out of convoy / match for this client (is_alive=False)."""
        state = await self.get_room(room_id)
        if state is None or client_id not in state.players:
            return state

        player = state.players[client_id]
        if state.phase == Phase.finished:
            state.players[client_id] = player.model_copy(update={"connected": False})
            await self.save_room(state)
            return state

        state.players[client_id] = player.model_copy(
            update={"connected": False, "is_alive": False}
        )
        if client_id in state.votes:
            del state.votes[client_id]
        if state.reveal_queue:
            state.reveal_queue = [cid for cid in state.reveal_queue if cid != client_id]
            if state.reveal_index >= len(state.reveal_queue):
                state.reveal_queue = []
                state.reveal_index = 0
                state.reveal_deadline_ts = None
                state.reveal_card_type = None
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
        """Shuffle characters + professions + factions, then deal 6-card hands (once)."""
        state = await self.ensure_room(room_id)
        if state.roles_assigned:
            if not state.hands_dealt:
                await self.deal_hands(room_id)
                state = await self.ensure_room(room_id)
            return state

        client_ids = list(state.players.keys())
        # Prefer seating order: alive humans + AI only (safety if prune missed)
        client_ids = [
            cid
            for cid in client_ids
            if state.players[cid].is_ai or state.players[cid].is_alive
        ]
        if len(client_ids) > settings.room_capacity:
            client_ids = client_ids[: settings.room_capacity]
        characters = list(CHARACTER_IDS)
        professions = list(ROLES)
        random.shuffle(characters)
        random.shuffle(professions)

        for idx, client_id in enumerate(client_ids):
            player = state.players[client_id]
            character_id = characters[idx % len(characters)]
            role = professions[idx % len(professions)]
            state.players[client_id] = player.model_copy(
                update={"role": role, "character_id": character_id}
            )

        self._assign_factions(state)

        state.roles_assigned = True
        # Phase clock is owned by phase_machine (Pitch + deadline); keep Init here
        # only until start_match_from_init runs after deal.
        await self.save_room(state)
        logger.info(
            "Assigned characters room=%s mapping=%s factions=%s",
            room_id,
            {cid: p.character_id for cid, p in state.players.items()},
            {cid: (p.faction.value if p.faction else None) for cid, p in state.players.items()},
        )
        await self.deal_hands(room_id)
        from app.services.phase_machine import start_match_from_init

        started = await start_match_from_init(room_id)
        return started or await self.ensure_room(room_id)

    @staticmethod
    def _assign_factions(state: RoomState) -> None:
        """
        Real humans → HUMAN. Among AI seats, synthetic_count are SYNTHETIC;
        remaining AI seats are HUMAN (still LLM bots, human faction for win/dataset).
        Agent-facing Helixa prompts never receive SYNTHETIC.
        """
        human_seats = [cid for cid, p in state.players.items() if not p.is_ai]
        ai_seats = [cid for cid, p in state.players.items() if p.is_ai]

        for cid in human_seats:
            player = state.players[cid]
            state.players[cid] = player.model_copy(update={"faction": Faction.human})

        n_syn = min(max(0, int(settings.synthetic_count)), len(ai_seats))
        synthetic_ids = set(random.sample(ai_seats, n_syn)) if n_syn else set()
        for cid in ai_seats:
            fac = Faction.synthetic if cid in synthetic_ids else Faction.human
            player = state.players[cid]
            state.players[cid] = player.model_copy(update={"faction": fac})

    async def _hand_key(self, room_id: str, client_id: str) -> str:
        return HAND_KEY.format(room_id=room_id, client_id=client_id)

    async def save_hand(
        self, room_id: str, client_id: str, hand: list[dict[str, Any]]
    ) -> None:
        key = await self._hand_key(room_id, client_id)
        await self.redis.set(key, json.dumps(hand, ensure_ascii=False))
        await self._touch_private_ttl(room_id, key)

    async def get_hand(
        self, room_id: str, client_id: str
    ) -> list[dict[str, Any]] | None:
        raw = await self.redis.get(await self._hand_key(room_id, client_id))
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, list) else None

    async def deal_hands(self, room_id: str) -> RoomState:
        from app.services.card_deal import build_hands_for_room

        state = await self.ensure_room(room_id)
        if state.hands_dealt:
            # Repair: flag set but Redis hand key missing (TTL / partial wipe)
            missing = [
                cid
                for cid in state.players
                if await self.get_hand(room_id, cid) is None
            ]
            if not missing:
                return state
            logger.warning(
                "hands_dealt but missing hands room=%s missing=%s — repairing",
                room_id,
                missing,
            )
            assignments = {
                cid: state.players[cid].character_id for cid in missing
            }
            professions = {cid: state.players[cid].role for cid in missing}
            hands = build_hands_for_room(assignments, professions=professions)
            for client_id, hand in hands.items():
                await self.save_hand(room_id, client_id, hand)
            return state

        assignments = {cid: p.character_id for cid, p in state.players.items()}
        professions = {cid: p.role for cid, p in state.players.items()}
        hands = build_hands_for_room(assignments, professions=professions)
        for client_id, hand in hands.items():
            await self.save_hand(room_id, client_id, hand)

        state.hands_dealt = True
        await self.save_room(state)
        logger.info("Dealt hands room=%s players=%s", room_id, list(hands.keys()))
        return state

    async def ensure_hand(
        self, room_id: str, client_id: str
    ) -> list[dict[str, Any]] | None:
        """Return hand; repair-deal if roles exist but Redis key is gone."""
        hand = await self.get_hand(room_id, client_id)
        if hand is not None:
            return hand
        state = await self.get_room(room_id)
        if state is None or not state.roles_assigned:
            return None
        await self.deal_hands(room_id)
        return await self.get_hand(room_id, client_id)

    async def reveal_card_in_hand(
        self, room_id: str, client_id: str, card_id: str
    ) -> tuple[dict[str, Any] | None, str | None]:
        """
        Mark card revealed in owner's hand.
        Returns (card, error). Secret missions can be marked for owner but
        callers must not broadcast them.
        """
        hand = await self.get_hand(room_id, client_id)
        if hand is None:
            return None, "hand_missing"
        found: dict[str, Any] | None = None
        for card in hand:
            if str(card.get("id")) == card_id:
                card["is_revealed"] = True
                found = card
                break
        if found is None:
            return None, "card_not_found"
        await self.save_hand(room_id, client_id, hand)
        return found, None

    async def public_revealed_by_player(
        self, room_id: str
    ) -> dict[str, list[dict[str, Any]]]:
        from app.services.card_deal import revealed_public_cards

        state = await self.get_room(room_id)
        if state is None:
            return {}
        out: dict[str, list[dict[str, Any]]] = {}
        for client_id, player in state.players.items():
            hand = await self.get_hand(room_id, client_id)
            if not hand:
                continue
            revealed = revealed_public_cards(hand)
            if not revealed:
                continue
            key = player.character_id or client_id
            out[key] = revealed
            out[client_id] = revealed
        return out

    async def list_room_ids(self) -> list[str]:
        """Active room ids from Redis keys `bunker:room:{id}` (not events/hands)."""
        ids: list[str] = []
        async for key in self.redis.scan_iter(match="bunker:room:*", count=100):
            parts = str(key).split(":")
            if len(parts) == 3 and parts[0] == "bunker" and parts[1] == "room":
                ids.append(parts[2])
        return ids

    async def append_event(self, room_id: str, event: dict[str, Any]) -> None:
        key = self._events_key(room_id)
        await self.redis.rpush(key, json.dumps(event))
        state = await self.get_room(room_id)
        await self._touch_ttl(room_id, state.session_id if state else None)

    async def list_events(
        self, room_id: str, *, limit: int | None = None
    ) -> list[dict[str, Any]]:
        """Peek events without deleting (for reconnect history / active session API)."""
        key = self._events_key(room_id)
        if limit is None or limit <= 0:
            raw_list = await self.redis.lrange(key, 0, -1)
        else:
            # last N events
            raw_list = await self.redis.lrange(key, -limit, -1)

        events: list[dict[str, Any]] = []
        for raw in raw_list:
            try:
                events.append(json.loads(raw))
            except json.JSONDecodeError:
                logger.warning("skip bad event json room=%s", room_id)
        return events

    async def append_private_message(
        self,
        room_id: str,
        human_id: str,
        agent_id: str,
        message: dict[str, Any],
    ) -> None:
        key = self._private_key(room_id, human_id, agent_id)
        await self.redis.rpush(key, json.dumps(message))
        await self._touch_private_ttl(room_id, key)

    async def list_private_thread(
        self, room_id: str, human_id: str, agent_id: str
    ) -> list[dict[str, Any]]:
        key = self._private_key(room_id, human_id, agent_id)
        raw_list = await self.redis.lrange(key, 0, -1)
        messages: list[dict[str, Any]] = []
        for raw in raw_list:
            try:
                messages.append(json.loads(raw))
            except json.JSONDecodeError:
                logger.warning(
                    "skip bad private msg room=%s human=%s agent=%s",
                    room_id,
                    human_id,
                    agent_id,
                )
        return messages

    async def list_private_threads_for_user(
        self, room_id: str, human_id: str
    ) -> dict[str, list[dict[str, Any]]]:
        """Return {agent_id: messages[]} for all private threads of this human."""
        pattern = PRIVATE_KEY.format(
            room_id=room_id, human_id=human_id, agent_id="*"
        )
        threads: dict[str, list[dict[str, Any]]] = {}
        async for key in self.redis.scan_iter(match=pattern, count=100):
            # key = bunker:room:{room}:private:{human}:{agent}
            parts = key.split(":")
            if len(parts) < 6:
                continue
            agent_id = parts[-1]
            raw_list = await self.redis.lrange(key, 0, -1)
            messages: list[dict[str, Any]] = []
            for raw in raw_list:
                try:
                    messages.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
            threads[agent_id] = messages
        return threads

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
        private_pattern = PRIVATE_PATTERN.format(room_id=room_id)
        async for key in self.redis.scan_iter(match=private_pattern, count=100):
            keys.append(key)
        hand_pattern = HAND_PATTERN.format(room_id=room_id)
        async for key in self.redis.scan_iter(match=hand_pattern, count=100):
            keys.append(key)
        if keys:
            await self.redis.delete(*keys)


redis_store = RedisStateStore()
