"""Lightweight in-process event bus for mock agents and room lifecycle."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

from app.redis_state import redis_store

logger = logging.getLogger(__name__)

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[Handler]] = defaultdict(list)
        self._lock = asyncio.Lock()

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._subscribers[topic].append(handler)

    def unsubscribe(self, topic: str, handler: Handler) -> None:
        handlers = self._subscribers.get(topic, [])
        if handler in handlers:
            handlers.remove(handler)

    async def _publish_local(self, topic: str, event: dict[str, Any]) -> None:
        handlers = list(self._subscribers.get(topic, []))
        # Also fan-out to room-specific channel if present
        room_id = event.get("room_id")
        if room_id:
            handlers.extend(self._subscribers.get(f"room:{room_id}", []))
        for handler in handlers:
            try:
                await handler(event)
            except Exception:
                logger.exception("event bus handler failed topic=%s", topic)

    async def publish(self, topic: str, event: dict[str, Any]) -> None:
        payload = {"topic": topic, "event": event}
        await redis_store.redis.publish("event_bus_broadcast", json.dumps(payload))

    async def start_pubsub(self) -> asyncio.Task[None]:
        async def _listen() -> None:
            pubsub = redis_store.redis.pubsub()
            await pubsub.psubscribe("event_bus_broadcast")
            try:
                async for msg in pubsub.listen():
                    if msg["type"] == "pmessage":
                        try:
                            data = json.loads(msg["data"])
                            topic = data.get("topic")
                            event = data.get("event")
                            if topic and event:
                                await self._publish_local(topic, event)
                        except Exception:
                            logger.exception("Failed to process event bus pubsub message")
            except asyncio.CancelledError:
                pass
            finally:
                await pubsub.punsubscribe()
                await pubsub.close()

        return asyncio.create_task(_listen(), name="eventbus-pubsub")


event_bus = EventBus()
