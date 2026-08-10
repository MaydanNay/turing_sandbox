from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class Phase(str, Enum):
    init = "Init"
    pitch = "Pitch"
    recess = "Recess"
    conflict = "Conflict"
    revision = "Revision"
    turing = "Turing"
    vote = "Vote"
    resolve = "Resolve"
    finished = "Finished"


class Faction(str, Enum):
    """System ground-truth team. Never shown to players or agent-facing prompts."""

    human = "HUMAN"
    synthetic = "SYNTHETIC"


class PlayerInfo(BaseModel):
    client_id: str
    role: str | None = None  # profession: Врач / Инженер / …
    character_id: str | None = None  # canonical avatar: vance / cole / …
    faction: Faction | None = None  # HUMAN | SYNTHETIC — system-only
    is_ai: bool = False
    connected: bool = True
    is_alive: bool = True


class RoomState(BaseModel):
    room_id: str
    session_id: str | None = None
    phase: Phase = Phase.init
    phase_deadline_ts: float | None = None
    # Minutes until convoy arrives (7 | 15 | 30). None → use global PHASE_DURATION_SCALE
    match_duration_minutes: int | None = None
    # Unix ts when matchmaking ends and bots fill empty seats (Init only)
    matchmaking_deadline_ts: float | None = None
    # Private lobby: invite friends by code; host starts (no public matchmaking)
    is_private: bool = False
    invite_code: str | None = None
    host_client_id: str | None = None
    players: dict[str, PlayerInfo] = Field(default_factory=dict)
    roles_assigned: bool = False
    hands_dealt: bool = False
    # Eviction order (character_id)
    brig_character_ids: list[str] = Field(default_factory=list)
    # client_id → character_id
    votes: dict[str, str] = Field(default_factory=dict)
    vote_open: bool = False
    # Reveal turn queue (client_ids)
    reveal_queue: list[str] = Field(default_factory=list)
    reveal_index: int = 0
    reveal_deadline_ts: float | None = None
    reveal_card_type: str | None = None


MATCH_DURATION_CHOICES = (7, 15, 30)


class SessionCreateRequest(BaseModel):
    match_duration_minutes: int = Field(
        default=15,
        description="Minutes until convoy: 7 (quick), 15 (standard), 30 (long)",
    )
    private: bool = Field(
        default=False,
        description="If true, create a private room with invite code (not public matchmaking)",
    )


class SessionJoinRequest(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class SessionCreateResponse(BaseModel):
    session_id: UUID
    room_id: str
    status: str
    ws_url: str
    match_duration_minutes: int | None = None
    invite_code: str | None = None
    is_private: bool = False
    # One-time lobby seat hold; pass as ?seat_token= on WS connect
    seat_token: str | None = None


def room_state_for_client(state: RoomState) -> dict[str, Any]:
    """Serialize room for WS/HTTP clients without leaking faction."""
    data = state.model_dump(mode="json")
    for player in data.get("players", {}).values():
        if isinstance(player, dict):
            player.pop("faction", None)
    return data


class WsInboundMessage(BaseModel):
    action: str
    text: str | None = None
    payload: dict[str, Any] | None = None


class WsOutboundMessage(BaseModel):
    type: str
    room_id: str
    client_id: str | None = None
    action: str | None = None
    text: str | None = None
    is_ai: bool = False
    phase: Phase | None = None
    state: RoomState | None = None
    payload: dict[str, Any] | None = None
    ts: datetime = Field(default_factory=datetime.utcnow)


class SessionFinishRequest(BaseModel):
    winner_id: str | None = None
    winning_team: str | None = Field(
        default=None,
        description="SYNTHETICS | HUMAN | ABORTED | DRAW — optional; derived if omitted",
    )
    brig_agents: list[str] | None = Field(
        default=None,
        description="Canonical agent ids in brig at finish (e.g. vance)",
    )
    survived_agents: list[str] | None = Field(
        default=None,
        description="Canonical AI agent ids not in brig; derived from room if omitted",
    )


class SessionFinishResponse(BaseModel):
    session_id: UUID
    status: str
    events_persisted: int
    winner_id: str | None = None
    winning_team: str | None = Field(
        default=None,
        description="Server-derived: HUMAN | SYNTHETICS | ABORTED | DRAW",
    )


class SessionSummary(BaseModel):
    session_id: UUID
    room_id: str
    created_at: datetime
    status: str
    winner_id: str | None = None
    events_count: int = 0
    resumable: bool = False


class SessionDetail(SessionSummary):
    phase: str | None = None


class SessionEventItem(BaseModel):
    id: str | None = None
    timestamp: datetime | str | None = None
    user_id: str
    is_ai: bool = False
    action_type: str
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class SessionEventsResponse(BaseModel):
    session_id: UUID
    room_id: str
    source: str  # "postgres" | "redis"
    events: list[SessionEventItem]
