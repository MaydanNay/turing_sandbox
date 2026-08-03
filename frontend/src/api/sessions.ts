import { buildApiUrl } from '@/config/env';
import type { SessionCreateResponse } from '@/types/game';

export async function createSession(): Promise<SessionCreateResponse> {
  const res = await fetch(buildApiUrl('/api/v1/sessions'), { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status}`);
  }
  return res.json() as Promise<SessionCreateResponse>;
}

export async function fetchRoomState(roomId: string): Promise<unknown> {
  const res = await fetch(buildApiUrl(`/api/v1/sessions/${roomId}/state`));
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
  return res.json();
}
