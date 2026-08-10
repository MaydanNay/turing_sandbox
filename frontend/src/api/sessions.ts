import { buildApiUrl } from '@/config/env';
import type { SessionCreateResponse } from '@/types/game';

export interface SessionSummary {
  session_id: string;
  room_id: string;
  created_at: string;
  status: string;
  winner_id: string | null;
  events_count: number;
  resumable: boolean;
}

export interface SessionDetail extends SessionSummary {
  phase: string | null;
}

export interface SessionEventItem {
  id: string | null;
  timestamp: string | null;
  user_id: string;
  is_ai: boolean;
  action_type: string;
  raw_payload: Record<string, unknown>;
}

export interface SessionEventsResponse {
  session_id: string;
  room_id: string;
  source: string;
  events: SessionEventItem[];
}

export async function createSession(options?: {
  matchDurationMinutes?: 7 | 15 | 30;
  private?: boolean;
}): Promise<SessionCreateResponse> {
  const res = await fetch(buildApiUrl('/api/v1/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      match_duration_minutes: options?.matchDurationMinutes ?? 15,
      private: Boolean(options?.private),
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`);
  }
  return res.json() as Promise<SessionCreateResponse>;
}

export async function joinSessionByInvite(
  inviteCode: string,
): Promise<SessionCreateResponse> {
  const res = await fetch(buildApiUrl('/api/v1/sessions/join'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: inviteCode.trim().toUpperCase() }),
  });
  if (!res.ok) {
    let detail = `Failed to join: ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<SessionCreateResponse>;
}

export async function finishSession(
  roomId: string,
  options?: {
    winnerId?: string | null;
    winningTeam?: string | null;
    brigAgents?: string[];
    survivedAgents?: string[];
  },
): Promise<{
  session_id: string;
  events_persisted: number;
  winning_team?: string | null;
}> {
  const res = await fetch(buildApiUrl(`/api/v1/sessions/${roomId}/finish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      winner_id: options?.winnerId ?? null,
      winning_team: options?.winningTeam ?? null,
      brig_agents: options?.brigAgents ?? null,
      survived_agents: options?.survivedAgents ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to finish session: ${res.status}`);
  }
  return res.json() as Promise<{
    session_id: string;
    events_persisted: number;
    winning_team?: string | null;
  }>;
}

export async function fetchRoomState(roomId: string): Promise<unknown> {
  const res = await fetch(buildApiUrl(`/api/v1/sessions/${roomId}/state`));
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
  return res.json();
}

export async function fetchSession(roomId: string): Promise<SessionDetail> {
  const res = await fetch(buildApiUrl(`/api/v1/sessions/${roomId}`));
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json() as Promise<SessionDetail>;
}

export async function listSessions(params?: {
  status?: 'active' | 'finished';
  limit?: number;
}): Promise<SessionSummary[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query}` : '';
  const res = await fetch(buildApiUrl(`/api/v1/sessions${suffix}`));
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json() as Promise<SessionSummary[]>;
}

export async function fetchSessionEvents(
  roomId: string,
): Promise<SessionEventsResponse> {
  const res = await fetch(buildApiUrl(`/api/v1/sessions/${roomId}/events`));
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return res.json() as Promise<SessionEventsResponse>;
}
