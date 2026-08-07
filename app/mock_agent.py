"""Seat-filler bots + Helixa public-table speech (no hardcoded pitch lines)."""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.connection_manager import manager
from app.event_bus import event_bus
from app.redis_state import redis_store
from app.schemas import Phase

logger = logging.getLogger(__name__)

# Quiet window after last human table trigger before one Helixa reply.
TABLE_SPEAK_DEBOUNCE_MIN_SECONDS = 5
TABLE_SPEAK_DEBOUNCE_MAX_SECONDS = 15

# room_id -> set of bot client_ids we spawned
_active_bots: dict[str, set[str]] = {}
_bot_tasks: dict[str, asyncio.Task] = {}


def _bot_client_id() -> str:
    return f"bot-{uuid.uuid4().hex[:8]}"


async def ensure_mock_agents(room_id: str) -> None:
    """Fill room up to ROOM_CAPACITY with AI seat bots when humans are scarce."""
    state = await redis_store.ensure_room(room_id)
    humans = [p for p in state.players.values() if not p.is_ai and p.connected]
    bots = [p for p in state.players.values() if p.is_ai]

    needed = max(0, settings.room_capacity - len(humans) - len(bots))
    if len(humans) >= settings.room_capacity:
        return

    room_bots = _active_bots.setdefault(room_id, set())

    for _ in range(needed):
        bot_id = _bot_client_id()
        await redis_store.upsert_player(room_id, bot_id, is_ai=True, connected=True)
        room_bots.add(bot_id)
        logger.info("Seat bot joined room=%s bot=%s", room_id, bot_id)

    await redis_store.assign_roles(room_id)

    task_key = f"listener:{room_id}"
    existing = _bot_tasks.get(task_key)
    if existing is None or existing.done():
        _bot_tasks[task_key] = asyncio.create_task(
            _room_bot_loop(room_id), name=task_key
        )


async def _room_bot_loop(room_id: str) -> None:
    """On join/chat/pitch/phase — one Helixa line after quiet debounce (coalesce bursts)."""

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    pending: asyncio.Task[None] | None = None

    async def on_room_event(event: dict[str, Any]) -> None:
        if event.get("room_id") != room_id:
            return
        if event.get("is_ai"):
            return
        action = event.get("action")
        if action in ("chat", "pitch", "phase_changed", "joined"):
            await queue.put(event)

    async def _debounced_speak(delay_s: float) -> None:
        try:
            await asyncio.sleep(delay_s)
        except asyncio.CancelledError:
            return

        state = await redis_store.get_room(room_id)
        if state is None or state.phase == Phase.finished:
            return
        if state.phase not in (Phase.pitch, Phase.conflict):
            return

        alive_bots = [p for p in state.players.values() if p.is_ai and p.connected]
        if not alive_bots:
            return

        bot = random.choice(alive_bots)
        try:
            await _bot_speak_helixa(room_id, bot.client_id)
        except asyncio.CancelledError:
            # Reply is only broadcast after Helixa returns — no partial speak.
            raise

    def _schedule_speak() -> None:
        nonlocal pending
        if pending is not None and not pending.done():
            pending.cancel()
        delay_s = float(
            random.randint(
                TABLE_SPEAK_DEBOUNCE_MIN_SECONDS,
                TABLE_SPEAK_DEBOUNCE_MAX_SECONDS,
            )
        )
        pending = asyncio.create_task(
            _debounced_speak(delay_s), name=f"table-speak:{room_id}"
        )
        logger.debug(
            "Table speak scheduled room=%s delay=%.0fs", room_id, delay_s
        )

    topic = f"room:{room_id}"
    event_bus.subscribe(topic, on_room_event)
    await queue.put({"room_id": room_id, "action": "joined"})

    try:
        while True:
            try:
                await asyncio.wait_for(queue.get(), timeout=120.0)
            except asyncio.TimeoutError:
                state = await redis_store.get_room(room_id)
                if state is None or state.phase == Phase.finished:
                    break
                continue

            state = await redis_store.get_room(room_id)
            if state is None or state.phase == Phase.finished:
                break

            if state.phase not in (Phase.pitch, Phase.conflict, Phase.init):
                continue

            bots = [p for p in state.players.values() if p.is_ai and p.connected]
            if not bots:
                continue

            _schedule_speak()
    except asyncio.CancelledError:
        raise
    finally:
        if pending is not None and not pending.done():
            pending.cancel()
            try:
                await pending
            except asyncio.CancelledError:
                pass
        event_bus.unsubscribe(topic, on_room_event)
        logger.info("Seat bot loop stopped room=%s", room_id)


async def _bot_speak_helixa(room_id: str, bot_id: str) -> None:
    # Lazy import avoids circular: mock_agent → helixa_adapter → services → session_finish → mock_agent
    from app.services.helixa_adapter import (
        public_history_from_events,
        request_table_reply,
    )

    state = await redis_store.get_room(room_id)
    if state is None:
        return
    bot = state.players.get(bot_id)
    if bot is None or not bot.is_ai:
        return

    player_ids = list(state.players.keys())
    events = await redis_store.list_events(room_id, limit=40)
    # Prefer human-readable character ids in history when known
    history = public_history_from_events(events)
    enriched: list[dict[str, str]] = []
    for msg in history:
        sid = msg["sender"]
        player = state.players.get(sid)
        label = (player.character_id if player and player.character_id else sid)
        enriched.append({"sender": label, "text": msg["text"]})

    hint_parts = []
    if bot.role:
        hint_parts.append(f"Profession: {bot.role}")
    if bot.character_id:
        hint_parts.append(f"You are {bot.character_id}")
    personality_hint = ". ".join(hint_parts) if hint_parts else None

    reply = await request_table_reply(
        match_id=room_id,
        agent_client_id=bot_id,
        room_player_ids=player_ids,
        phase=state.phase,
        public_chat_history=enriched,
        personality_hint=personality_hint,
        character_id=bot.character_id,
        faction=bot.faction,
    )
    if not reply:
        logger.info(
            "Helixa table reply skipped (empty/error) room=%s bot=%s char=%s",
            room_id,
            bot_id,
            bot.character_id,
        )
        return

    await _bot_speak(room_id, bot_id, reply)


async def _bot_speak(room_id: str, bot_id: str, text: str) -> None:
    event = {
        "type": "message",
        "room_id": room_id,
        "client_id": bot_id,
        "action": "chat",
        "text": text,
        "is_ai": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "payload": {"source": "helixa"},
    }
    await redis_store.append_event(
        room_id,
        {
            "user_id": bot_id,
            "is_ai": True,
            "action_type": "chat",
            "raw_payload": event,
            "timestamp": event["ts"],
        },
    )
    await manager.broadcast(room_id, event)
    await event_bus.publish("message", event)
    logger.info("Seat bot spoke room=%s bot=%s via helixa", room_id, bot_id)


async def stop_room_bots(room_id: str) -> None:
    task_key = f"listener:{room_id}"
    task = _bot_tasks.pop(task_key, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    _active_bots.pop(room_id, None)


def start_mock_agent_supervisor() -> asyncio.Task:
    """Optional idle supervisor — kept for lifecycle clarity."""

    async def _noop_supervisor() -> None:
        while True:
            await asyncio.sleep(3600)

    return asyncio.create_task(_noop_supervisor(), name="mock-agent-supervisor")
