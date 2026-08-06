"""Helixa game-agent adapter for Live private chat + match outcome ELT."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings
from app.schemas import Faction, Phase

logger = logging.getLogger(__name__)

FALLBACK_REPLY = "[Терминал Аванпоста: сбой связи с нейроузлом]"

# Must match frontend CHARACTERS ids (personas for Helixa / portraits)
CANONICAL_AGENT_IDS = (
    "vance",
    "cole",
    "martha",
    "penny",
    "gwen",
    "logan",
    "chester",
    "roxy",
)

PHASE_TO_HELIXA: dict[Phase, str] = {
    Phase.init: "INIT",
    Phase.pitch: "PITCH",
    Phase.recess: "RECESS",
    Phase.conflict: "CONFLICT",
    Phase.revision: "REVISION",
    Phase.turing: "TURING",
    Phase.vote: "VOTE",
    Phase.resolve: "RESOLVE",
    Phase.finished: "RESOLVE",
}

# Agent-facing Helixa role: always human officer (faction is system/dataset only).
AGENT_FACING_ROLE = "HUMAN_OFFICER"


def canonical_agent_id(
    room_player_ids: list[str],
    agent_client_id: str,
    *,
    character_id: str | None = None,
) -> str:
    """Resolve Helixa agent_id: prefer shuffled character_id, else legacy seat index."""
    if character_id:
        return character_id
    try:
        idx = room_player_ids.index(agent_client_id)
    except ValueError:
        return agent_client_id
    if 0 <= idx < len(CANONICAL_AGENT_IDS):
        return CANONICAL_AGENT_IDS[idx]
    return agent_client_id


def _history_for_helixa(thread: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for msg in thread[-24:]:
        sender = str(msg.get("sender", "human"))
        text = str(msg.get("text", "")).strip()
        if not text:
            continue
        out.append({"sender": sender, "text": text})
    return out


def public_history_from_events(events: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Build Helixa public_chat_history from Redis room events."""
    out: list[dict[str, str]] = []
    for ev in events:
        action = str(ev.get("action_type") or "").lower()
        payload = ev.get("raw_payload") if isinstance(ev.get("raw_payload"), dict) else {}
        if action not in ("chat", "pitch") and payload.get("action") not in (
            "chat",
            "pitch",
        ):
            continue
        text = str(payload.get("text") or "").strip()
        if not text:
            continue
        sender = str(
            payload.get("client_id")
            or ev.get("user_id")
            or ("agent" if ev.get("is_ai") else "human")
        )
        out.append({"sender": sender, "text": text})
    return out[-24:]


def _helixa_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = (settings.helixa_internal_token or "").strip()
    if token:
        headers["X-Internal-Token"] = token
    return headers


def _faction_label(faction: Faction | str | None) -> str | None:
    if faction is None:
        return None
    if isinstance(faction, Faction):
        return faction.value
    text = str(faction).strip().upper()
    return text or None


async def _post_act(payload: dict[str, Any]) -> tuple[str, str] | None:
    """POST /act. Returns (reply, cot) or None on failure / empty."""
    if not settings.helixa_enabled:
        return None

    base = settings.helixa_base_url.rstrip("/")
    url = f"{base}/api/v1/game-agent/act"
    try:
        async with httpx.AsyncClient(timeout=settings.helixa_timeout_seconds) as client:
            resp = await client.post(url, json=payload, headers=_helixa_headers())
            resp.raise_for_status()
            data = resp.json()
            reply = str(data.get("reply") or "").strip()
            cot = str(data.get("cot") or "").strip() or "ok"
            if reply and reply != FALLBACK_REPLY:
                return reply, cot
            if reply:
                # Helixa itself returned fallback — treat as failure for table bots
                return None
    except Exception:
        logger.exception(
            "Helixa act failed match=%s agent=%s channel=%s url=%s",
            payload.get("match_id"),
            payload.get("agent_id"),
            payload.get("channel"),
            url,
        )
    return None


def _act_payload(
    *,
    match_id: str,
    agent_client_id: str,
    room_player_ids: list[str],
    phase: Phase,
    channel: str,
    private_chat_history: list[dict[str, str]],
    public_chat_history: list[dict[str, str]],
    table_cards_visible: list[str] | None,
    personality_hint: str | None,
    character_id: str | None,
    faction: Faction | str | None,
    default_phase: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "match_id": match_id,
        "agent_id": canonical_agent_id(
            room_player_ids,
            agent_client_id,
            character_id=character_id,
        ),
        # Always human-facing — agents must not "know" they are synthetic.
        "role": AGENT_FACING_ROLE,
        "phase": PHASE_TO_HELIXA.get(phase, default_phase),
        "channel": channel,
        "table_cards_visible": table_cards_visible or [],
        "private_chat_history": private_chat_history,
        "public_chat_history": public_chat_history,
        "personality_hint": personality_hint,
    }
    label = _faction_label(faction)
    if label:
        # Logged by Helixa for datasets; never injected into LLM prompts.
        payload["faction"] = label
    return payload


async def request_private_reply(
    *,
    match_id: str,
    agent_client_id: str,
    room_player_ids: list[str],
    phase: Phase,
    private_thread: list[dict[str, Any]],
    table_cards_visible: list[str] | None = None,
    personality_hint: str | None = None,
    character_id: str | None = None,
    faction: Faction | str | None = None,
) -> tuple[str, str]:
    """Call Helixa POST /act channel=private. Returns (reply, cot)."""
    payload = _act_payload(
        match_id=match_id,
        agent_client_id=agent_client_id,
        room_player_ids=room_player_ids,
        phase=phase,
        channel="private",
        private_chat_history=_history_for_helixa(private_thread),
        public_chat_history=[],
        table_cards_visible=table_cards_visible,
        personality_hint=personality_hint,
        character_id=character_id,
        faction=faction,
        default_phase="RECESS",
    )
    result = await _post_act(payload)
    if result:
        return result
    return FALLBACK_REPLY, "error"


async def request_table_reply(
    *,
    match_id: str,
    agent_client_id: str,
    room_player_ids: list[str],
    phase: Phase,
    public_chat_history: list[dict[str, str]],
    table_cards_visible: list[str] | None = None,
    personality_hint: str | None = None,
    character_id: str | None = None,
    faction: Faction | str | None = None,
) -> str | None:
    """
    Helixa public-table line. Returns reply text or None (caller should stay silent).
    """
    payload = _act_payload(
        match_id=match_id,
        agent_client_id=agent_client_id,
        room_player_ids=room_player_ids,
        phase=phase,
        channel="public",
        private_chat_history=[],
        public_chat_history=public_chat_history[-24:],
        table_cards_visible=table_cards_visible,
        personality_hint=personality_hint,
        character_id=character_id,
        faction=faction,
        default_phase="PITCH",
    )
    result = await _post_act(payload)
    if not result:
        return None
    reply, _cot = result
    return reply or None


async def report_match_outcome(
    match_id: str,
    winning_team: str,
    survived_agents: list[str],
    brig_agents: list[str],
    agent_factions: dict[str, str] | None = None,
) -> bool:
    """
    POST /api/v1/game-agent/resolve for DPO/RLHF MATCH_OUTCOME_LABEL.
    Silent-fail: never raises; returns False on any transport/HTTP error.
    """
    if not settings.helixa_enabled:
        logger.warning(
            "Helixa resolve skipped (disabled) match=%s winning_team=%s",
            match_id,
            winning_team,
        )
        return False

    base = settings.helixa_base_url.rstrip("/")
    url = f"{base}/api/v1/game-agent/resolve"
    payload: dict[str, Any] = {
        "match_id": match_id,
        "winning_team": winning_team,
        "survived_agents": list(survived_agents),
        "brig_agents": list(brig_agents),
    }
    if agent_factions:
        payload["agent_factions"] = dict(agent_factions)
    timeout = min(float(settings.helixa_resolve_timeout_seconds), 2.5)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload, headers=_helixa_headers())
            resp.raise_for_status()
            logger.info(
                "Helixa resolve ok match=%s winning_team=%s survived=%s brig=%s",
                match_id,
                winning_team,
                survived_agents,
                brig_agents,
            )
            return True
    except (httpx.RequestError, httpx.HTTPStatusError, Exception) as exc:
        logger.warning(
            "Helixa resolve failed (silent) match=%s url=%s err=%s",
            match_id,
            url,
            exc,
        )
        return False
