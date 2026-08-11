"""WebSocket room protocol: ws://{host}/ws/room/{room_id}/{client_id}."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.config import settings
from app.connection_manager import manager
from app.db import AsyncSessionLocal
from app.event_bus import event_bus
from app.models import GameSession, SessionStatus
from app.redis_state import redis_store
from app.schemas import room_state_for_client
from app.services.card_deal import public_card_view
from app.services.helixa_adapter import FALLBACK_REPLY, request_private_reply

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

ALLOWED_ACTIONS = {
    "chat",
    "pitch",
    "vote",
    "leave",
    "private_chat_send",
    "reveal_card",
    "move_to",
    "ping",
    "start_match",
}


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


async def _send_hand(room_id: str, client_id: str) -> None:
    from app.services.hand_push import push_hand_to_client

    await push_hand_to_client(room_id, client_id)


async def _send_revealed_sync(room_id: str, client_id: str) -> None:
    by_player = await redis_store.public_revealed_by_player(room_id)
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "revealed_cards_sync",
            "room_id": room_id,
            "client_id": client_id,
            "by_player": by_player,
            "ts": _now_iso(),
        },
    )


async def _handle_reveal_card(
    room_id: str, client_id: str, data: dict[str, Any]
) -> None:
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    card_id = str(payload.get("card_id") or data.get("card_id") or "").strip()
    if not card_id:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "reveal_card requires card_id",
                "ts": _now_iso(),
            },
        )
        return

    # Peek type before mutating — turn / phase gate
    hand = await redis_store.get_hand(room_id, client_id)
    pending_type: str | None = None
    if hand:
        for c in hand:
            if str(c.get("id")) == card_id:
                pending_type = str(c.get("type") or "") or None
                break

    from app.services.match_flow import advance_reveal, validate_player_reveal

    gate_err = await validate_player_reveal(room_id, client_id, pending_type)
    if gate_err:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": f"reveal_card denied: {gate_err}",
                "ts": _now_iso(),
            },
        )
        return

    card, err = await redis_store.reveal_card_in_hand(room_id, client_id, card_id)
    if err or card is None:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": f"reveal_card failed: {err or 'unknown'}",
                "ts": _now_iso(),
            },
        )
        return

    # Only the owner can reveal; card always loaded from their Redis hand.
    await _send_hand(room_id, client_id)

    if card.get("type") == "secret_mission":
        # Mark locally for owner, never broadcast / never persist to public events
        return

    state = await redis_store.get_room(room_id)
    player = state.players.get(client_id) if state else None
    character_id = player.character_id if player else None
    public = public_card_view(card)
    if public is None:
        return

    msg = {
        "type": "card_revealed",
        "room_id": room_id,
        "client_id": client_id,
        "character_id": character_id,
        "card": public,
        "ts": _now_iso(),
    }
    await manager.broadcast(room_id, msg)
    await redis_store.append_event(
        room_id,
        {
            "user_id": client_id,
            "is_ai": bool(player and player.is_ai),
            "action_type": "reveal_card",
            "raw_payload": msg,
            "timestamp": msg["ts"],
        },
    )

    if state is not None:
        await advance_reveal(room_id, state, expected_client_id=client_id)


async def _handle_leave(room_id: str, client_id: str) -> None:
    """Explicit abandon: dead for match / out of convoy; room continues."""
    state = await redis_store.abandon_player(room_id, client_id)
    if state is not None and state.is_private and not state.roles_assigned:
        from app.services.matchmaking import ensure_host

        if ensure_host(state):
            await redis_store.save_room(state)
            state = await redis_store.get_room(room_id) or state

    leave = {
        "type": "player_left",
        "room_id": room_id,
        "client_id": client_id,
        "abandoned": True,
        "state": room_state_for_client(state) if state else None,
        "ts": _now_iso(),
    }
    await redis_store.append_event(
        room_id,
        {
            "user_id": client_id,
            "is_ai": False,
            "action_type": "leave",
            "raw_payload": leave,
            "timestamp": leave["ts"],
        },
    )
    await manager.broadcast(room_id, leave)
    await event_bus.publish(
        "message",
        {
            "room_id": room_id,
            "action": "leave",
            "phase": state.phase.value if state else None,
            "is_ai": False,
        },
    )
    logger.info("client abandoned room=%s client=%s", room_id, client_id)


async def _handle_start_match(room_id: str, client_id: str) -> None:
    """Private lobby: host starts early (bots fill empty seats)."""
    state = await redis_store.get_room(room_id)
    if state is None:
        return
    if not state.is_private:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "start_match is only for private rooms",
                "ts": _now_iso(),
            },
        )
        return
    if state.roles_assigned or state.phase.value != "Init":
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "Match already started",
                "ts": _now_iso(),
            },
        )
        return

    from app.services.matchmaking import ensure_host, try_finish_matchmaking

    # Repair host only if seat abandoned — never steal on soft-disconnect
    if ensure_host(state):
        await redis_store.save_room(state)
        state = await redis_store.get_room(room_id) or state

    if state.host_client_id != client_id:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "Only the host can start the match",
                "ts": _now_iso(),
            },
        )
        return

    await try_finish_matchmaking(room_id, force=True)


async def _handle_vote(room_id: str, client_id: str, data: dict[str, Any]) -> None:
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    target = str(
        payload.get("target_character_id")
        or payload.get("target")
        or data.get("text")
        or ""
    ).strip()
    if not target:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": "vote requires target_character_id",
                "ts": _now_iso(),
            },
        )
        return

    from app.services.match_flow import cast_vote

    _state, err = await cast_vote(room_id, client_id, target)
    if err:
        await manager.send_personal(
            room_id,
            client_id,
            {
                "type": "error",
                "room_id": room_id,
                "text": f"vote denied: {err}",
                "ts": _now_iso(),
            },
        )


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
            character_id=agent.character_id if agent else None,
            faction=agent.faction if agent else None,
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
                "text": FALLBACK_REPLY,
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
async def room_websocket(
    websocket: WebSocket,
    room_id: str,
    client_id: str,
    seat_token: str | None = Query(default=None),
) -> None:
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

    from app.services.matchmaking import claim_lobby_seat, try_finish_matchmaking

    # Ensure room shell exists for brand-new sessions before claim
    await redis_store.ensure_room(room_id, session_id=room_id)

    status, state, is_reconnect = await claim_lobby_seat(
        room_id, client_id, seat_token
    )
    if status == "missing":
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "room_id": room_id,
                "text": "Room not found",
                "ts": _now_iso(),
            }
        )
        await websocket.close(code=4004)
        return
    if status in ("full", "bad_token"):
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "room_id": room_id,
                "text": "Room is full"
                if status == "full"
                else "Invalid or expired seat token",
                "ts": _now_iso(),
            }
        )
        await websocket.close(code=4003)
        return
    if status == "started":
        await websocket.accept()
        await websocket.send_json(
            {
                "type": "error",
                "room_id": room_id,
                "text": "Match already started",
                "ts": _now_iso(),
            }
        )
        await websocket.close(code=4002)
        return

    await manager.connect(room_id, client_id, websocket)

    state = await try_finish_matchmaking(room_id) or state
    state = await redis_store.get_room(room_id) or state

    # Snapshot to the joining client
    await manager.send_personal(
        room_id,
        client_id,
        {
            "type": "state",
            "room_id": room_id,
            "client_id": client_id,
            "state": room_state_for_client(state),
            "ts": _now_iso(),
        },
    )

    # Keep other searchers' lobby counters in sync
    if state.phase.value == "Init" and not state.roles_assigned:
        await manager.broadcast(
            room_id,
            {
                "type": "state",
                "room_id": room_id,
                "client_id": client_id,
                "state": room_state_for_client(state),
                "ts": _now_iso(),
            },
            exclude=client_id,
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
    await _send_hand(room_id, client_id)
    await _send_revealed_sync(room_id, client_id)

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
            data = await asyncio.wait_for(websocket.receive_json(), timeout=65.0)
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

            if action == "ping":
                await manager.send_personal(
                    room_id,
                    client_id,
                    {
                        "type": "pong",
                        "room_id": room_id,
                        "ts": _now_iso(),
                    },
                )
                continue

            if action == "private_chat_send":
                await _handle_private_chat_send(room_id, client_id, data)
                continue

            if action == "reveal_card":
                await _handle_reveal_card(room_id, client_id, data)
                continue

            if action == "vote":
                await _handle_vote(room_id, client_id, data)
                continue

            if action == "leave":
                await _handle_leave(room_id, client_id)
                continue

            if action == "start_match":
                await _handle_start_match(room_id, client_id)
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

    except asyncio.TimeoutError:
        logger.info("client timeout room=%s client=%s", room_id, client_id)
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
        prior = await redis_store.get_room(room_id)
        prior_player = prior.players.get(client_id) if prior else None
        # Explicit leave already broadcast player_left + is_alive=False
        if prior_player is not None and not prior_player.is_alive:
            await redis_store.mark_disconnected(room_id, client_id)
            return
        state = await redis_store.mark_disconnected(room_id, client_id)
        leave = {
            "type": "player_left",
            "room_id": room_id,
            "client_id": client_id,
            "abandoned": False,
            "state": room_state_for_client(state) if state else None,
            "ts": _now_iso(),
        }
        await manager.broadcast(room_id, leave)
