import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  evaluateMeetingCallGate,
  MEETING_CALL_MAX,
  type MeetingCallGate,
} from '@/data/meetingCallLimits';

interface TableMeetingModalProps {
  open: boolean;
  meetingCallsUsed: number;
  lastMeetingCallAt: number | null;
  onCallMeeting: () => void;
  onCancel: () => void;
}

function formatRetry(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}с`;
}

/** Modal from table click: call everyone to the meeting. */
export function TableMeetingModal({
  open,
  meetingCallsUsed,
  lastMeetingCallAt,
  onCallMeeting,
  onCancel,
}: TableMeetingModalProps) {
  const [gate, setGate] = useState<MeetingCallGate>(() =>
    evaluateMeetingCallGate(meetingCallsUsed, lastMeetingCallAt),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      setGate(evaluateMeetingCallGate(meetingCallsUsed, lastMeetingCallAt));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [open, meetingCallsUsed, lastMeetingCallAt]);

  if (typeof document === 'undefined') return null;

  const statusLine = !gate.ok
    ? gate.reason === 'max'
      ? 'Лимит созывов на эту сессию исчерпан.'
      : `Кулдаун: подождите ещё ${formatRetry(gate.retryInSec)}.`
    : `Доступно созывов: ${gate.remainingCalls} из ${MEETING_CALL_MAX}.`;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCancel();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="table-meeting-title"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-bunker-border/70 bg-black/90 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-bunker-muted">
                Стол переговоров
              </p>
              <h2
                id="table-meeting-title"
                className="mt-1 font-mono text-sm uppercase tracking-wider text-bunker-neon"
              >
                Общий сбор?
              </h2>
              <p
                className={`mt-2 font-mono text-[10px] ${
                  gate.ok ? 'text-bunker-neon/80' : 'text-amber-300/90'
                }`}
              >
                {statusLine}
              </p>
            </div>
            <div className="flex flex-col gap-1 p-2">
              <button
                type="button"
                disabled={!gate.ok}
                onClick={onCallMeeting}
                className="w-full rounded-lg px-3 py-3 text-center font-mono text-[11px] uppercase tracking-widest text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:text-bunker-muted disabled:hover:bg-transparent"
              >
                {gate.ok
                  ? 'Созвать всех'
                  : gate.reason === 'max'
                    ? 'Лимит исчерпан'
                    : `Ждите ${formatRetry(gate.retryInSec)}`}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-lg px-3 py-3 text-center font-mono text-[11px] uppercase tracking-widest text-bunker-muted transition hover:bg-white/5"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
