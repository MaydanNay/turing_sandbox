import { useEffect, useRef, useState } from 'react';

const FAKE_CALLSIGNS = [
  'Kestrel',
  'Dock-12',
  'Rook',
  'Vesper',
  'Ash-9',
  'Marrow',
  'Relay-3',
  'Cobalt',
  'Nadir',
  'Quill',
] as const;

/**
 * Ceiling during search: never show capacity-1 (e.g. 7/8) — that feels
 * like the match should start. Real start is full room or timer end.
 */
function maxDuringSearch(capacity: number): number {
  return Math.max(1, capacity - 2);
}

/** Final fake lobby size for this search session (biased low–mid). */
function pickTarget(realHumans: number, capacity: number): number {
  const cap = maxDuringSearch(capacity);
  const roll = Math.random();
  let target: number;
  if (roll < 0.4) {
    target = 2 + Math.floor(Math.random() * 2); // 2–3
  } else if (roll < 0.75) {
    target = 3 + Math.floor(Math.random() * 2); // 3–4
  } else if (roll < 0.95) {
    target = 5 + Math.floor(Math.random() * 2); // 5–6
  } else {
    target = cap; // rare top (6 for capacity 8)
  }
  return Math.min(cap, Math.max(realHumans, target));
}

/** Opening count: often 1, sometimes already 2–3 (joined “with others”). */
function pickStartCount(realHumans: number, target: number): number {
  if (realHumans >= target) return realHumans;
  const roll = Math.random();
  if (roll < 0.45) return realHumans; // classic 1/8
  if (roll < 0.8) {
    return Math.min(target, realHumans + 1 + Math.floor(Math.random() * 2)); // ~2–3
  }
  return Math.min(target, Math.max(realHumans + 2, 3)); // start around 3
}

function nextDelayMs(remainingSec: number, leftToAdd: number): number {
  if (leftToAdd <= 0) return 60_000;
  const budget = Math.max(3, remainingSec - 3);
  const slice = (budget / leftToAdd) * (0.75 + Math.random() * 0.55);
  // Slower joins so the climb is readable (≈2–10s between seats)
  return Math.round(Math.min(10_000, Math.max(2_000, slice * 1000)));
}

/**
 * Public matchmaking: climb the displayed seat count so solo search
 * doesn't sit at 1/8 the whole time. Never drops below real humans.
 * Caps below “almost full” so 7/8 never appears while waiting.
 */
export function useStagedLobbyFill(
  realHumans: number,
  capacity: number,
  remainingSec: number,
  sessionKey: number | null,
): { displayCount: number; lastJoinName: string | null } {
  const [displayCount, setDisplayCount] = useState(realHumans);
  const [lastJoinName, setLastJoinName] = useState<string | null>(null);
  const targetRef = useRef(realHumans);
  const namesRef = useRef<string[]>([]);
  const nameIdxRef = useRef(0);
  const remainingRef = useRef(remainingSec);
  const sawLiveCountdownRef = useRef(false);
  remainingRef.current = remainingSec;

  useEffect(() => {
    if (sessionKey == null) {
      sawLiveCountdownRef.current = false;
      return;
    }
    const target = pickTarget(realHumans, capacity);
    targetRef.current = target;
    namesRef.current = [...FAKE_CALLSIGNS].sort(() => Math.random() - 0.5);
    nameIdxRef.current = 0;
    sawLiveCountdownRef.current = false;
    setDisplayCount(pickStartCount(realHumans, target));
    setLastJoinName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per search session
  }, [sessionKey, capacity]);

  useEffect(() => {
    setDisplayCount((n) => Math.max(n, realHumans));
  }, [realHumans]);

  // Only treat “end snap” after we actually saw a live timer (avoid remaining=0 flash)
  useEffect(() => {
    if (sessionKey == null) return;
    if (remainingSec > 5) sawLiveCountdownRef.current = true;
  }, [remainingSec, sessionKey]);

  useEffect(() => {
    if (sessionKey == null) return;
    if (!sawLiveCountdownRef.current) return;
    if (remainingSec > 1) return;
    // Last second: look full — bots are about to fill for real
    setDisplayCount(capacity);
  }, [remainingSec, sessionKey, capacity]);

  useEffect(() => {
    if (sessionKey == null) return;
    const target = targetRef.current;
    const current = Math.max(displayCount, realHumans);
    if (current >= target) return;
    // Don't keep climbing in the final second (end snap owns that)
    if (remainingRef.current <= 1) return;

    const delay = nextDelayMs(remainingRef.current, target - current);
    const timer = window.setTimeout(() => {
      const name =
        namesRef.current[nameIdxRef.current % namesRef.current.length] ?? null;
      nameIdxRef.current += 1;
      if (name) {
        setLastJoinName(name);
        window.setTimeout(() => {
          setLastJoinName((prev) => (prev === name ? null : prev));
        }, 2200);
      }
      setDisplayCount((n) => Math.min(target, Math.max(n + 1, realHumans)));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [displayCount, realHumans, sessionKey]);

  return {
    displayCount: Math.max(displayCount, realHumans),
    lastJoinName,
  };
}
