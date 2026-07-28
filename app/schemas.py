from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class Phase(str, Enum):
    init = "Init"
    pitch = "Pitch"
    conflict = "Conflict"
    vote = "Vote"
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


class SessionFinishResponse(BaseModel):
    session_id: UUID
    status: str
    events_persisted: int
    winner_id: str | None = None
