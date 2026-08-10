export type GamePhase =
  | 'INIT'
  | 'PITCH'
  | 'RECESS'
  | 'CONFLICT'
  | 'REVISION'
  | 'TURING'
  | 'VOTE'
  | 'RESOLVE';

export type Gender = 'male' | 'female';

import type { CardType } from '@/types/card';

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
  kind?: 'message' | 'system' | 'turn' | 'reveal';
  subtitle?: string;
  cardTitle?: string;
  cardType?: CardType;
  cardDescription?: string;
  cardImageUrl?: string;
  senderColor?: string;
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
  action:
    | 'chat'
    | 'pitch'
    | 'vote'
    | 'leave'
    | 'private_chat_send'
    | 'reveal_card'
    | 'move_to'
    | 'ping'
    | 'start_match';
  type?: 'private_chat_send' | 'reveal_card';
  text?: string;
  payload?: Record<string, unknown>;
  phase?: string;
  agent_id?: string;
  card_id?: string;
}

/** Spec-style inbound message (future / extended protocol) */
export interface WsClientMessage {
  action: 'sync_state' | 'chat' | 'suspicion_up' | 'typing' | 'move_to';
  data?: Record<string, unknown>;
  sender?: string;
  text?: string;
  target?: string;
  payload?: Record<string, unknown>;
}

/** Actual backend outbound message shapes */
export interface BackendPlayerInfo {
  client_id: string;
  role: string | null;
  character_id?: string | null;
  is_ai: boolean;
  connected: boolean;
  is_alive?: boolean;
}

export interface BackendRoomState {
  room_id: string;
  session_id: string | null;
  phase:
    | 'Init'
    | 'Pitch'
    | 'Recess'
    | 'Conflict'
    | 'Revision'
    | 'Turing'
    | 'Vote'
    | 'Resolve'
    | 'Finished';
  phase_deadline_ts: number | null;
  match_duration_minutes?: number | null;
  matchmaking_deadline_ts?: number | null;
  is_private?: boolean;
  invite_code?: string | null;
  host_client_id?: string | null;
  players: Record<string, BackendPlayerInfo>;
  roles_assigned: boolean;
  brig_character_ids?: string[];
  votes?: Record<string, string>;
  vote_open?: boolean;
  reveal_queue?: string[];
  reveal_index?: number;
  reveal_deadline_ts?: number | null;
  reveal_card_type?: string | null;
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
  action: 'chat' | 'pitch' | 'vote' | 'move_to';
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
  abandoned?: boolean;
  state?: BackendRoomState | null;
  ts: string;
}

export interface EpiloguePlayerRow {
  client_id: string;
  character_id: string | null;
  name: string;
  role?: string | null;
  faction?: string | null;
  is_ai?: boolean;
  location?: string;
  in_convoy?: boolean;
  in_brig?: boolean;
}

export interface EpilogueReport {
  winning_team: string;
  synthetics_in_convoy: number;
  convoy: EpiloguePlayerRow[];
  brig: EpiloguePlayerRow[];
  players?: EpiloguePlayerRow[];
}

export interface BackendMatchEndedMessage {
  type: 'match_ended';
  room_id: string;
  phase?: string;
  payload: EpilogueReport;
  state?: BackendRoomState;
  ts: string;
}

export interface BackendErrorMessage {
  type: 'error';
  room_id: string;
  text: string;
  ts: string;
}

export interface BackendHistoryEvent {
  user_id?: string;
  is_ai?: boolean;
  action_type?: string;
  timestamp?: string;
  raw_payload?: Record<string, unknown> | null;
}

export interface BackendHistoryMessage {
  type: 'history';
  room_id: string;
  client_id?: string;
  events: BackendHistoryEvent[];
  ts: string;
}

export interface BackendPrivateChatTypingMessage {
  type: 'private_chat_typing';
  room_id: string;
  client_id?: string;
  human_id?: string;
  agent_id: string;
  typing: boolean;
  ts: string;
}

export interface BackendPrivateChatMessage {
  type: 'private_chat_message';
  room_id: string;
  client_id: string;
  human_id?: string;
  agent_id: string;
  text: string;
  from: 'me' | 'them';
  is_ai?: boolean;
  payload?: Record<string, unknown> | null;
  ts: string;
}

export interface BackendPrivateThreadMessage {
  sender?: string;
  text?: string;
  client_id?: string;
  ts?: string;
}

export interface BackendPrivateChatSyncMessage {
  type: 'private_chat_sync';
  room_id: string;
  client_id?: string;
  threads: Record<string, BackendPrivateThreadMessage[]>;
  ts: string;
}

export interface BackendHandCard {
  id: string;
  type: string;
  title: string;
  description: string;
  is_revealed?: boolean;
  isRevealed?: boolean;
  image_hint?: string | null;
  imageUrl?: string;
}

export interface BackendHandMessage {
  type: 'hand';
  room_id: string;
  client_id?: string;
  cards: BackendHandCard[];
  ts: string;
}

export interface BackendCardRevealedMessage {
  type: 'card_revealed';
  room_id: string;
  client_id: string;
  character_id?: string | null;
  card: BackendHandCard;
  forced?: boolean;
  ts: string;
}

export interface BackendRevealedCardsSyncMessage {
  type: 'revealed_cards_sync';
  room_id: string;
  client_id?: string;
  by_player: Record<string, BackendHandCard[]>;
  ts: string;
}

export interface BackendRevealTurnMessage {
  type: 'reveal_turn';
  room_id: string;
  client_id: string | null;
  character_id?: string | null;
  card_type?: string | null;
  deadline_ts?: number | null;
  queue_index?: number;
  queue_len?: number;
  state: BackendRoomState;
  ts: string;
}

export interface BackendVoteCastMessage {
  type: 'vote_cast';
  room_id: string;
  client_id: string;
  character_id?: string | null;
  target_character_id: string;
  votes: Record<string, string>;
  state: BackendRoomState;
  ts: string;
}

export interface BackendVoteOpenedMessage {
  type: 'vote_opened';
  room_id: string;
  deadline_ts?: number | null;
  state: BackendRoomState;
  ts: string;
}

export interface BackendVoteResolvedMessage {
  type: 'vote_resolved';
  room_id: string;
  tied: boolean;
  target_character_id: string | null;
  brig_character_ids: string[];
  state: BackendRoomState;
  ts: string;
}

export type BackendWsMessage =
  | BackendStateMessage
  | BackendPhaseChangedMessage
  | BackendChatMessage
  | BackendPlayerJoinedMessage
  | BackendPlayerLeftMessage
  | BackendErrorMessage
  | BackendHistoryMessage
  | BackendPrivateChatTypingMessage
  | BackendPrivateChatMessage
  | BackendPrivateChatSyncMessage
  | BackendHandMessage
  | BackendCardRevealedMessage
  | BackendRevealedCardsSyncMessage
  | BackendRevealTurnMessage
  | BackendVoteCastMessage
  | BackendVoteOpenedMessage
  | BackendVoteResolvedMessage
  | BackendMatchEndedMessage;

export interface SessionCreateResponse {
  session_id: string;
  room_id: string;
  status: string;
  ws_url: string;
  match_duration_minutes?: number | null;
  invite_code?: string | null;
  is_private?: boolean;
  seat_token?: string | null;
}

export interface TypingIndicator {
  sender: string;
  until: number;
}
