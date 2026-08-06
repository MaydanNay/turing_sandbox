"""In-memory WebSocket connection manager keyed by room_id."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> {client_id -> WebSocket}
        self._rooms: dict[str, dict[str, WebSocket]] = {}

    def room_clients(self, room_id: str) -> list[str]:
        return list(self._rooms.get(room_id, {}).keys())

    def get(self, room_id: str, client_id: str) -> WebSocket | None:
        return self._rooms.get(room_id, {}).get(client_id)

    def human_count(self, room_id: str) -> int:
        return len(self._rooms.get(room_id, {}))

    async def connect(self, room_id: str, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        room = self._rooms.setdefault(room_id, {})
        # Replace stale socket for same client_id
        old = room.get(client_id)
        if old is not None and old is not websocket:
            try:
                await old.close(code=4000)
            except Exception:
                pass
        room[client_id] = websocket
        logger.info("WS connect room=%s client=%s (n=%s)", room_id, client_id, len(room))

    def disconnect(self, room_id: str, client_id: str) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        room.pop(client_id, None)
        if not room:
            self._rooms.pop(room_id, None)
        logger.info("WS disconnect room=%s client=%s", room_id, client_id)

    async def send_personal(
        self, room_id: str, client_id: str, message: dict[str, Any]
    ) -> None:
        ws = self._rooms.get(room_id, {}).get(client_id)
        if ws is None:
            return
        if ws.client_state != WebSocketState.CONNECTED:
            return
        await ws.send_json(message)

    async def broadcast(
        self,
        room_id: str,
        message: dict[str, Any],
        *,
        exclude: str | None = None,
    ) -> None:
        room = self._rooms.get(room_id, {})
        dead: list[str] = []
        for cid, ws in list(room.items()):
            if exclude and cid == exclude:
                continue
            if ws.client_state != WebSocketState.CONNECTED:
                dead.append(cid)
                continue
            try:
                await ws.send_json(message)
            except Exception:
                logger.exception("broadcast failed room=%s client=%s", room_id, cid)
                dead.append(cid)
        for cid in dead:
            self.disconnect(room_id, cid)


manager = ConnectionManager()
