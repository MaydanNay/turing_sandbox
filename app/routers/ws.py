"""WebSocket room protocol: ws://{host}/ws/room/{room_id}/{client_id}."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.config import settings
from app.connection_manager import manager
from app.db import AsyncSessionLocal
from app.event_bus import event_bus
from app.mock_agent import ensure_mock_agents
from app.models import GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import Phase
from app.services.helixa_adapter import request_private_reply

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

ALLOWED_ACTIONS = {"chat", "pitch", "vote", "phase", "private_chat_send"}


async def _session_is_finished(room_id: str) -> bool:
    try:
        sid = uuid.UUID(room_id)
    except ValueError:
        return False
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(GameSession).where(GameSession.id == sid))
        session = result.scalar_one_or_none()
        return bool(session and session.status == SessionStatus.finished)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _inbound_action(data: dict[str, Any]) -> str:
    """Parse type and/or action from inbound WS payload."""
    for key in ("type", "action"):
        raw = data.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip().lower()
    return ""


async def _send_private_sync(room_id: str, client_id: str) -> None:
    threads = await redis_store.list_private_threads_for_user(room_id, client_id)
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "private_chat_sync",
            "room_id": room_id,
            "client_id": client_id,
            "threads": threads,
            "ts": _now_iso(),
        },
    )


async def _handle_private_chat_send(
    room_id: str, client_id: str, data: dict[str, Any]
) -> None:
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    agent_id = str(
        payload.get("agent_id")
        or data.get("agent_id")
        or data.get("target")
        or ""
    ).strip()
    text = str(data.get("text") or "").strip()
    if not agent_id or not text:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "private_chat_send requires text and agent_id",
                "ts": _now_iso(),
            },
        )
        return

    state = await redis_store.get_room(room_id)
    if state is None or agent_id not in state.players:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": f"Unknown agent_id '{agent_id}'",
                "ts": _now_iso(),
            },
        )
        return

    ts = _now_iso()
    human_msg = {
        "sender": "human",
        "text": text,
        "client_id": client_id,
        "ts": ts,
    }
    await redis_store.append_private_message(room_id, client_id, agent_id, human_msg)

    agent = state.players[agent_id]
    if not agent.is_ai:
        return

    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "private_chat_typing",
            "room_id": room_id,
            "client_id": agent_id,
            "human_id": client_id,
            "agent_id": agent_id,
            "typing": True,
            "ts": _now_iso(),
        },
    )

    asyncio.create_task(
        _private_agent_reply(room_id, client_id, agent_id),
        name=f"private-reply:{room_id}:{client_id}:{agent_id}",
    )


async def _private_agent_reply(
    room_id: str, human_id: str, agent_id: str
) -> None:
    try:
        state = await redis_store.get_room(room_id)
        if state is None:
            return
        thread = await redis_store.list_private_thread(room_id, human_id, agent_id)
        player_ids = list(state.players.keys())
        agent = state.players.get(agent_id)
        reply, cot = await request_private_reply(
            match_id=room_id,
            agent_client_id=agent_id,
            room_player_ids=player_ids,
            phase=state.phase,
            private_thread=thread,
            personality_hint=agent.role if agent else None,
            is_ai_agent=bool(agent and agent.is_ai),
        )

        ts = _now_iso()
        agent_msg = {
            "sender": "agent",
            "text": reply,
            "client_id": agent_id,
            "cot": cot,
            "ts": ts,
        }
        await redis_store.append_private_message(
            room_id, human_id, agent_id, agent_msg
        )
        await manager.send_personal(
            room_id,
            human_id,
            {
                "type": "private_chat_message",
                "room_id": room_id,
                "client_id": agent_id,
                "human_id": human_id,
                "agent_id": agent_id,
                "text": reply,
                "from": "them",
                "is_ai": True,
                "payload": {"cot": cot},
                "ts": ts,
            },
        )
    except Exception:
        logger.exception(
            "private agent reply failed room=%s human=%s agent=%s",
            room_id,
            human_id,
            agent_id,
        )
        await manager.send_personal(
            room_id,
            human_id,
            {
                "type": "private_chat_message",
                "room_id": room_id,
                "client_id": agent_id,
                "human_id": human_id,
                "agent_id": agent_id,
                "text": "[Терминал Аванпоста: сбой связи с нейроузлом]",
                "from": "them",
                "is_ai": True,
                "ts": _now_iso(),
            },
        )
    finally:
        await manager.send_personal(
            room_id,
            human_id,
            {
                "type": "private_chat_typing",
                "room_id": room_id,
                "client_id": agent_id,
                "human_id": human_id,
                "agent_id": agent_id,
                "typing": False,
                "ts": _now_iso(),
            },
        )


@router.websocket("/ws/room/{room_id}/{client_id}")
async def room_websocket(websocket: WebSocket, room_id: str, client_id: str) -> None:
    if await _session_is_finished(room_id):
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "room_id": room_id,
                "text": "Session already finished",
                "ts": _now_iso(),
            }
        )
        await websocket.close(code=4001)
        return

    prior = await redis_store.get_room(room_id)
    is_reconnect = bool(prior and client_id in prior.players)

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
            "ts": _now_iso(),
        },
    )

    # Replay buffered events so refresh restores public chat
    history_events = await redis_store.list_events(
        room_id, limit=settings.history_event_limit
    )
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "history",
            "room_id": room_id,
            "client_id": client_id,
            "events": history_events,
            "ts": _now_iso(),
        },
    )

    # Private threads for this human (authority = Redis)
    await _send_private_sync(room_id, client_id)

    if not is_reconnect:
        join_msg = {
            "type": "player_joined",
            "room_id": room_id,
            "client_id": client_id,
            "is_ai": False,
            "ts": _now_iso(),
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
            {
                "room_id": room_id,
                "action": "joined",
                "client_id": client_id,
                "is_ai": False,
            },
        )
    else:
        logger.info("WS reconnect room=%s client=%s", room_id, client_id)

    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            action = _inbound_action(data)
            if action not in ALLOWED_ACTIONS:
                await manager.send_personal(
                    room_id,
                    client_id,
                    {
                        "type": "error",
                        "room_id": room_id,
                        "text": f"Unknown action '{action}'. Use: {sorted(ALLOWED_ACTIONS)}",
                        "ts": _now_iso(),
                    },
                )
                continue

            if action == "private_chat_send":
                await _handle_private_chat_send(room_id, client_id, data)
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
                            "ts": _now_iso(),
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
                    "ts": _now_iso(),
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
                "ts": _now_iso(),
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
        # Avoid racing a reconnect: only cleanup if this socket is still registered
        current = manager.get(room_id, client_id)
        if current is not None and current is not websocket:
            return
        if current is not None and current.client_state != WebSocketState.CONNECTED:
            pass
        manager.disconnect(room_id, client_id)
        await redis_store.mark_disconnected(room_id, client_id)
        leave = {
            "type": "player_left",
            "room_id": room_id,
            "client_id": client_id,
            "ts": _now_iso(),
        }
        await manager.broadcast(room_id, leave)
