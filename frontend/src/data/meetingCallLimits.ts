/** Max emergency meetings a player may call per session. */
export const MEETING_CALL_MAX = 2;
/** Minimum gap between two meeting calls. */
export const MEETING_CALL_COOLDOWN_MS = 90_000;

export type MeetingCallGate =
  | {
      ok: true;
      remainingCalls: number;
    }
  | {
      ok: false;
      reason: 'max' | 'cooldown';
      remainingCalls: number;
      retryInSec: number;
    };

export function evaluateMeetingCallGate(
  callsUsed: number,
  lastCallAt: number | null,
  now = Date.now(),
): MeetingCallGate {
  const remainingCalls = Math.max(0, MEETING_CALL_MAX - callsUsed);
  if (remainingCalls <= 0) {
    return { ok: false, reason: 'max', remainingCalls: 0, retryInSec: 0 };
  }
  if (lastCallAt != null) {
    const elapsed = now - lastCallAt;
    if (elapsed < MEETING_CALL_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        remainingCalls,
        retryInSec: Math.ceil((MEETING_CALL_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }
  return { ok: true, remainingCalls };
}
