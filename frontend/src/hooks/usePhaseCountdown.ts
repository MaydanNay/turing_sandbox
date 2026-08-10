import { useEffect, useState } from 'react';

function remainingFromDeadline(deadlineTs: number | null | undefined): number {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return 0;
  return Math.max(0, Math.ceil(deadlineTs - Date.now() / 1000));
}

/** Countdown synced to an absolute unix-seconds deadline (server phase clock). */
export function useDeadlineCountdown(deadlineTs: number | null | undefined): number {
  const [remaining, setRemaining] = useState(() => remainingFromDeadline(deadlineTs));

  useEffect(() => {
    setRemaining(remainingFromDeadline(deadlineTs));
    if (deadlineTs == null) return;
    const id = window.setInterval(() => {
      setRemaining(remainingFromDeadline(deadlineTs));
    }, 250);
    return () => window.clearInterval(id);
  }, [deadlineTs]);

  return remaining;
}

export function usePhaseCountdown(initialSeconds: number, resetKey: string): number {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds, resetKey]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [remaining, resetKey]);

  return remaining;
}
