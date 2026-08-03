export type GamePhase = 'INIT' | 'PITCH' | 'CONFLICT' | 'VOTE' | 'RESOLVE';

export type Gender = 'male' | 'female';

export interface Player {
  id: string;
  characterId: string;
  name: string;
  role: string;
  gender: Gender;
  /** Точный возраст сессии — показываем только себе */
  age: number;
  stats: Record<string, string>;
  is_alive: boolean;
  suspicion_score: number;
  avatarUrl?: string;
  is_ai?: boolean;
  connected?: boolean;
  /** 0–7, seat file = tablePosition + 1 */
  tablePosition: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  is_ai?: boolean;
}

export interface MyProfile {
  id: string;
  characterId: string;
  name: string;
  role: string;
  gender: Gender;
  age: number;
  inventory: string[];
}

/** Client → server WS payload */
export interface WsOutboundAction {
  action: 'chat' | 'pitch' | 'vote' | 'phase';
  text?: string;
  payload?: Record<string, unknown>;
  phase?: string;
}

/** Spec-style inbound message (future / extended protocol) */
export interface WsClientMessage {
  action: 'sync_state' | 'chat' | 'suspicion_up' | 'typing';
  data?: Record<string, unknown>;
  sender?: string;
  text?: string;
  target?: string;
}

/** Actual backend outbound message shapes */
export interface BackendPlayerInfo {
  client_id: string;
  role: string | null;
  is_ai: boolean;
  connected: boolean;
}

export interface BackendRoomState {
  room_id: string;
  session_id: string | null;
  phase: 'Init' | 'Pitch' | 'Conflict' | 'Vote' | 'Finished';
  phase_deadline_ts: number | null;
  players: Record<string, BackendPlayerInfo>;
  roles_assigned: boolean;
}

export interface BackendStateMessage {
  type: 'state';
  room_id: string;
  client_id: string;
  state: BackendRoomState;
  ts: string;
}

export interface BackendPhaseChangedMessage {
  type: 'phase_changed';
  room_id: string;
  client_id: string;
  phase: BackendRoomState['phase'];
  state: BackendRoomState;
  ts: string;
}

export interface BackendChatMessage {
  type: 'message';
  room_id: string;
  client_id: string;
  action: 'chat' | 'pitch' | 'vote';
  text: string | null;
  is_ai: boolean;
  payload: Record<string, unknown> | null;
  ts: string;
}

export interface BackendPlayerJoinedMessage {
  type: 'player_joined';
  room_id: string;
  client_id: string;
  is_ai: boolean;
  ts: string;
}

export interface BackendPlayerLeftMessage {
  type: 'player_left';
  room_id: string;
  client_id: string;
  ts: string;
}

export interface BackendErrorMessage {
  type: 'error';
  room_id: string;
  text: string;
  ts: string;
}

export type BackendWsMessage =
  | BackendStateMessage
  | BackendPhaseChangedMessage
  | BackendChatMessage
  | BackendPlayerJoinedMessage
  | BackendPlayerLeftMessage
  | BackendErrorMessage;

export interface SessionCreateResponse {
  session_id: string;
  room_id: string;
  status: string;
  ws_url: string;
}

export interface TypingIndicator {
  sender: string;
  until: number;
}
