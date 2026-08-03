import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface RoundTimerProps {
  secondsRemaining: number;
  isUrgent?: boolean;
  tick?: boolean;
  onTick?: (next: number) => void;
  compact?: boolean;
}

export function RoundTimer({
  secondsRemaining,
  isUrgent = false,
  tick = false,
  onTick,
  compact = false,
}: RoundTimerProps) {
  const [displaySeconds, setDisplaySeconds] = useState(secondsRemaining);

  useEffect(() => {
    setDisplaySeconds(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (!tick) return;

    const id = window.setInterval(() => {
      setDisplaySeconds((prev) => {
        const next = Math.max(0, prev - 1);
        onTick?.(next);
        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [tick, onTick]);

  const urgent = isUrgent || displaySeconds <= 20;

  if (compact) {
    return (
      <motion.span
        className={`font-mono text-xs tabular-nums tracking-wide ${
          urgent ? 'text-red-400' : 'text-bunker-neon'
        }`}
        animate={urgent ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
        transition={urgent ? { duration: 1, repeat: Infinity } : undefined}
      >
        {formatTime(displaySeconds)}
      </motion.span>
    );
  }

  return (
    <motion.div
      className={`flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-xs tabular-nums tracking-wider ${
        urgent
          ? 'border-bunker-danger/60 bg-bunker-danger/10 text-bunker-danger'
          : 'border-bunker-neon/30 bg-bunker-neon/5 text-bunker-neon'
      }`}
      animate={
        urgent
          ? {
              opacity: [1, 0.55, 1],
              boxShadow: [
                '0 0 0 rgba(255,0,60,0)',
                '0 0 14px rgba(255,0,60,0.45)',
                '0 0 0 rgba(255,0,60,0)',
              ],
            }
          : { opacity: 1 }
      }
      transition={
        urgent ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }
      }
    >
      <span className="text-[9px] uppercase tracking-[0.2em] opacity-70">TIMER</span>
      <span className="font-semibold">{formatTime(displaySeconds)}</span>
    </motion.div>
  );
}
