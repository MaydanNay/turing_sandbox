"""WebSocket room protocol: ws://{host}/ws/room/{room_id}/{client_id}."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.connection_manager import manager
from app.event_bus import event_bus
from app.mock_agent import ensure_mock_agents
from app.redis_state import redis_store
from app.schemas import Phase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

ALLOWED_ACTIONS = {"chat", "pitch", "vote", "phase"}


@router.websocket("/ws/room/{room_id}/{client_id}")
async def room_websocket(websocket: WebSocket, room_id: str, client_id: str) -> None:
    await manager.connect(room_id, client_id, websocket)

    state = await redis_store.ensure_room(room_id, session_id=room_id)
    state = await redis_store.upsert_player(
        room_id, client_id, is_ai=False, connected=True
    )

    # Fill seats with mock Helixa bots before first snapshot
    await ensure_mock_agents(room_id)
    state = await redis_store.get_room(room_id) or state

    # Snapshot to the joining client (full room: humans + bots + roles)
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "state",
            "room_id": room_id,
            "client_id": client_id,
            "state": state.model_dump(mode="json"),
            "ts": datetime.now(timezone.utc).isoformat(),
        },
    )

    # Notify others
    join_msg = {
        "type": "player_joined",
        "room_id": room_id,
        "client_id": client_id,
        "is_ai": False,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast(room_id, join_msg, exclude=client_id)
    await redis_store.append_event(
        room_id,
        {
            "user_id": client_id,
            "is_ai": False,
            "action_type": "join",
            "raw_payload": join_msg,
            "timestamp": join_msg["ts"],
        },
    )

    await event_bus.publish(
        "message",
        {"room_id": room_id, "action": "joined", "client_id": client_id, "is_ai": False},
    )

    try:
        while True:
            data = await websocket.receive_json()
            action = str(data.get("action", "")).strip().lower()
            if action not in ALLOWED_ACTIONS:
                await manager.send_personal(
                    room_id,
                    client_id,
                    {
                        "type": "error",
                        "room_id": room_id,
                        "text": f"Unknown action '{action}'. Use: {sorted(ALLOWED_ACTIONS)}",
                        "ts": datetime.now(timezone.utc).isoformat(),
                    },
                )
                continue

            if action == "phase":
                phase_name = str(data.get("text") or data.get("phase") or "").strip()
                try:
                    new_phase = Phase(phase_name) if phase_name else Phase.pitch
                except ValueError:
                    await manager.send_personal(
                        room_id,
                        client_id,
                        {
                            "type": "error",
                            "room_id": room_id,
                            "text": f"Invalid phase. Use: {[p.value for p in Phase]}",
                            "ts": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    continue
                state = await redis_store.set_phase(room_id, new_phase)
                out = {
                    "type": "phase_changed",
                    "room_id": room_id,
                    "client_id": client_id,
                    "phase": state.phase.value,
                    "state": state.model_dump(mode="json"),
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
                await manager.broadcast(room_id, out)
                await redis_store.append_event(
                    room_id,
                    {
                        "user_id": client_id,
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
                continue

            text = data.get("text")
            payload = data.get("payload")
            out = {
                "type": "message",
                "room_id": room_id,
                "client_id": client_id,
                "action": action,
                "text": text,
                "is_ai": False,
                "payload": payload,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
            await redis_store.append_event(
                room_id,
                {
                    "user_id": client_id,
                    "is_ai": False,
                    "action_type": action,
                    "raw_payload": out,
                    "timestamp": out["ts"],
                },
            )
            await manager.broadcast(room_id, out)
            await event_bus.publish("message", out)

    except WebSocketDisconnect:
        logger.info("client disconnected room=%s client=%s", room_id, client_id)
    except Exception:
        logger.exception("WS error room=%s client=%s", room_id, client_id)
    finally:
        manager.disconnect(room_id, client_id)
        await redis_store.mark_disconnected(room_id, client_id)
        leave = {
            "type": "player_left",
            "room_id": room_id,
            "client_id": client_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        await manager.broadcast(room_id, leave)
