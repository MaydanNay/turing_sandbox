import { useEffect, useState } from 'react';

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
