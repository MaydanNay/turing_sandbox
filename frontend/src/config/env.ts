import type { GamePhase } from '@/types/game';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const WS_URL = import.meta.env.VITE_WS_URL ?? '';

/** Browser-facing API base — relative path uses Vite proxy in dev */
export function getApiBase(): string {
  if (API_URL) return API_URL.replace(/\/$/, '');
  return '';
}

export function getWsBase(): string {
  if (WS_URL) return WS_URL.replace(/\/$/, '');
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function buildWsUrl(
  roomId: string,
  clientId: string,
  seatToken?: string | null,
): string {
  const base = getWsBase();
  const url = `${base}/ws/room/${roomId}/${clientId}`;
  if (seatToken) {
    return `${url}?seat_token=${encodeURIComponent(seatToken)}`;
  }
  return url;
}

export function buildApiUrl(path: string): string {
  const base = getApiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

const BACKEND_PHASE_MAP: Record<string, GamePhase> = {
  Init: 'INIT',
  Pitch: 'PITCH',
  Recess: 'RECESS',
  Conflict: 'CONFLICT',
  Revision: 'REVISION',
  Turing: 'TURING',
  Vote: 'VOTE',
  Resolve: 'RESOLVE',
  Finished: 'RESOLVE',
};

export function mapBackendPhase(phase: string): GamePhase {
  return BACKEND_PHASE_MAP[phase] ?? 'INIT';
}

export function mapFrontendPhase(phase: GamePhase): string {
  const reverse: Record<GamePhase, string> = {
    INIT: 'Init',
    PITCH: 'Pitch',
    RECESS: 'Recess',
    CONFLICT: 'Conflict',
    REVISION: 'Revision',
    TURING: 'Turing',
    VOTE: 'Vote',
    RESOLVE: 'Resolve',
  };
  return reverse[phase];
}

export function generateClientId(): string {
  const stored = localStorage.getItem('turing_client_id');
  if (stored) return stored;
  const id = `player-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('turing_client_id', id);
  return id;
}
