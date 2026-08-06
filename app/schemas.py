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


class PlayerInfo(BaseModel):
    client_id: str
    role: str | None = None
    is_ai: bool = False
    connected: bool = True


class RoomState(BaseModel):
    room_id: str
    session_id: str | None = None
    phase: Phase = Phase.init
    phase_deadline_ts: float | None = None
    players: dict[str, PlayerInfo] = Field(default_factory=dict)
    roles_assigned: bool = False


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


class SessionCreateResponse(BaseModel):
    session_id: UUID
    room_id: str
    status: str
    ws_url: str


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
