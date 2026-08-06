import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

interface MeetingAnnouncementProps {
  open: boolean;
  callerName: string;
  onDone: () => void;
  durationMs?: number;
}

/** Among Us–style emergency meeting flash before everyone sits. */
export function MeetingAnnouncement({
  open,
  callerName,
  onDone,
  durationMs = 1800,
}: MeetingAnnouncementProps) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
  }, [open, onDone, durationMs]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 z-[90] flex items-center justify-center bg-black/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="px-6 text-center"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.05, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
              Аванпост
            </p>
            <h2 className="mt-3 font-mono text-3xl font-bold uppercase tracking-widest text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.45)] sm:text-5xl">
              Общий сбор
            </h2>
            <p className="mt-4 font-mono text-sm text-bunker-muted">
              Созвал(а):{' '}
              <span className="text-bunker-text">{callerName || 'Неизвестный'}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
