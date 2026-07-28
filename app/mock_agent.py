"""Mock Helixa agents — asyncio background workers filling empty seats."""

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

BOT_PITCH = "Я врач, я вам нужен в бункере! Не голосуйте против меня!"

# room_id -> set of bot client_ids we spawned
_active_bots: dict[str, set[str]] = {}
_bot_tasks: dict[str, asyncio.Task] = {}


def _bot_client_id() -> str:
    return f"bot-{uuid.uuid4().hex[:8]}"


async def ensure_mock_agents(room_id: str) -> None:
    """Fill room up to ROOM_CAPACITY with mock bots when humans are scarce."""
    state = await redis_store.ensure_room(room_id)
    humans = [p for p in state.players.values() if not p.is_ai and p.connected]
    bots = [p for p in state.players.values() if p.is_ai]

    needed = max(0, settings.room_capacity - len(humans) - len(bots))
    # Also: if fewer humans than min_human_players threshold conceptually —
    # TZ: when live humans are not enough, attach bots.
    if len(humans) >= settings.room_capacity:
        return

    room_bots = _active_bots.setdefault(room_id, set())

    for _ in range(needed):
        bot_id = _bot_client_id()
        await redis_store.upsert_player(room_id, bot_id, is_ai=True, connected=True)
        room_bots.add(bot_id)
        logger.info("Mock agent joined room=%s bot=%s", room_id, bot_id)

    await redis_store.assign_roles(room_id)

    # Start one listener task per room (idempotent)
    task_key = f"listener:{room_id}"
    existing = _bot_tasks.get(task_key)
    if existing is None or existing.done():
        _bot_tasks[task_key] = asyncio.create_task(
            _room_bot_loop(room_id), name=task_key
        )


async def _room_bot_loop(room_id: str) -> None:
    """Listen to room chat/pitch and reply during Pitch/Conflict with delay."""

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def on_room_event(event: dict[str, Any]) -> None:
        if event.get("room_id") != room_id:
            return
        if event.get("is_ai"):
            return
        action = event.get("action")
        if action in ("chat", "pitch", "phase_changed", "joined"):
            await queue.put(event)

    topic = f"room:{room_id}"
    event_bus.subscribe(topic, on_room_event)
    # Kick an initial pitch after join
    await queue.put({"room_id": room_id, "action": "joined"})

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120.0)
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

            delay = random.randint(3, 8)
            await asyncio.sleep(delay)

            state = await redis_store.get_room(room_id)
            if state is None or state.phase not in (Phase.pitch, Phase.conflict):
                # After delay phase may have changed; still allow pitch on init->pitch
                if state is None or state.phase == Phase.finished:
                    break
                if state.phase not in (Phase.pitch, Phase.conflict):
                    continue

            bot = random.choice([p for p in state.players.values() if p.is_ai])
            await _bot_speak(room_id, bot.client_id, BOT_PITCH)
    except asyncio.CancelledError:
        raise
    finally:
        event_bus.unsubscribe(topic, on_room_event)
        logger.info("Mock agent loop stopped room=%s", room_id)


async def _bot_speak(room_id: str, bot_id: str, text: str) -> None:
    event = {
        "type": "message",
        "room_id": room_id,
        "client_id": bot_id,
        "action": "chat",
        "text": text,
        "is_ai": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "payload": {"source": "mock_helixa"},
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
    logger.info("Mock agent spoke room=%s bot=%s", room_id, bot_id)


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
