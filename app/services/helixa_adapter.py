"""Helixa game-agent adapter for Live private chat + match outcome ELT."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings
from app.schemas import Phase

logger = logging.getLogger(__name__)

FALLBACK_REPLY = "[Терминал Аванпоста: сбой связи с нейроузлом]"

# Same seat order as frontend CHARACTERS / backendPlayersToFrontend
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


def canonical_agent_id(room_player_ids: list[str], agent_client_id: str) -> str:
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


def _helixa_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = (settings.helixa_internal_token or "").strip()
    if token:
        headers["X-Internal-Token"] = token
    return headers


async def request_private_reply(
    *,
    match_id: str,
    agent_client_id: str,
    room_player_ids: list[str],
    phase: Phase,
    private_thread: list[dict[str, Any]],
    table_cards_visible: list[str] | None = None,
    personality_hint: str | None = None,
    is_ai_agent: bool = True,
) -> tuple[str, str]:
    """Call Helixa POST /api/v1/game-agent/act. Returns (reply, cot)."""
    if not settings.helixa_enabled:
        return FALLBACK_REPLY, "disabled"

    base = settings.helixa_base_url.rstrip("/")
    url = f"{base}/api/v1/game-agent/act"
    payload = {
        "match_id": match_id,
        "agent_id": canonical_agent_id(room_player_ids, agent_client_id),
        "role": "SYNTHETIC_INFILTRATOR" if is_ai_agent else "HUMAN_OFFICER",
        "phase": PHASE_TO_HELIXA.get(phase, "RECESS"),
        "table_cards_visible": table_cards_visible or [],
        "private_chat_history": _history_for_helixa(private_thread),
        "personality_hint": personality_hint,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.helixa_timeout_seconds) as client:
            resp = await client.post(url, json=payload, headers=_helixa_headers())
            resp.raise_for_status()
            data = resp.json()
            reply = str(data.get("reply") or "").strip()
            cot = str(data.get("cot") or "").strip() or "ok"
            if reply:
                return reply, cot
    except Exception:
        logger.exception(
            "Helixa act failed match=%s agent=%s url=%s",
            match_id,
            agent_client_id,
            url,
        )

    return FALLBACK_REPLY, "error"


async def report_match_outcome(
    match_id: str,
    winning_team: str,
    survived_agents: list[str],
    brig_agents: list[str],
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
    payload = {
        "match_id": match_id,
        "winning_team": winning_team,
        "survived_agents": list(survived_agents),
        "brig_agents": list(brig_agents),
    }
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
