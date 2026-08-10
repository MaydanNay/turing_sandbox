import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

interface FloorClickMarkerProps {
  x: number;
  y: number;
  markerId: number;
  onDone: (markerId: number) => void;
}

/** WoW-like green ground target at click point (scene %). */
export function FloorClickMarker({ x, y, markerId, onDone }: FloorClickMarkerProps) {
  useEffect(() => {
    const t = window.setTimeout(() => onDone(markerId), 900);
    return () => window.clearTimeout(t);
  }, [markerId, onDone]);

  return (
    <AnimatePresence>
      <motion.div
        key={markerId}
        className="pointer-events-none absolute z-[2]"
        style={{ left: `${x}%`, top: `${y}%`, x: '-50%', y: '-50%' }}
        initial={{ opacity: 0.95, scale: 0.55 }}
        animate={{ opacity: [0.95, 0.75, 0], scale: [0.55, 1.05, 1.35] }}
        transition={{ duration: 0.85, ease: 'easeOut' }}
      >
        <div
          className="h-7 w-7 rounded-full border-2 border-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.55)]"
          style={{
            boxShadow:
              '0 0 0 2px rgba(16,185,129,0.35), 0 0 14px rgba(52,211,153,0.5), inset 0 0 8px rgba(52,211,153,0.35)',
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/90" />
      </motion.div>
    </AnimatePresence>
  );
}
