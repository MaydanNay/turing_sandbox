"""Lightweight in-process event bus for mock agents and room lifecycle."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

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

    async def publish(self, topic: str, event: dict[str, Any]) -> None:
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


event_bus = EventBus()
