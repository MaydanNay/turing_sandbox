"""Push dealt hands to connected human clients over WebSocket."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.connection_manager import manager
from app.redis_state import redis_store

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def push_hand_to_client(room_id: str, client_id: str) -> bool:
    """Send current hand to one client. Returns False if no hand yet."""
    hand = await redis_store.ensure_hand(room_id, client_id)
    if hand is None:
        return False
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "hand",
            "room_id": room_id,
            "client_id": client_id,
            "cards": hand,
            "ts": _now_iso(),
        },
    )
    return True


async def push_hands_to_humans(room_id: str) -> int:
    """After deal: push hands to every connected human. Returns how many sent."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return 0
    sent = 0
    for client_id, player in state.players.items():
        if player.is_ai or not player.connected:
            continue
        if await push_hand_to_client(room_id, client_id):
            sent += 1
    if sent:
        logger.info("pushed hands room=%s humans=%s", room_id, sent)
    return sent
