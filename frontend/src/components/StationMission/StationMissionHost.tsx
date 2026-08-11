import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { playUiSound } from '@/audio/uiSounds';
import { useStationMissionStore } from '@/store/stationMissionStore';

const SWITCH_LABELS = ['α', 'β', 'γ'] as const;

function shuffleOrder(): number[] {
  const order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

interface TerminalMinigameProps {
  placementId: string;
  onClose: () => void;
  onComplete: (placementId: string) => void;
}

function TerminalMinigame({
  placementId,
  onClose,
  onComplete,
}: TerminalMinigameProps) {
  const target = useMemo(() => shuffleOrder(), [placementId]);
  const [progress, setProgress] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);

  const targetLabels = target.map((i) => SWITCH_LABELS[i]).join(' → ');

  const onSwitch = (index: number) => {
    const expected = target[progress];
    if (expected === index) {
      const next = progress + 1;
      playUiSound('table');
      if (next >= target.length) {
        onComplete(placementId);
        return;
      }
      setProgress(next);
      return;
    }
    setErrorFlash(true);
    setProgress(0);
    window.setTimeout(() => setErrorFlash(false), 350);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="terminal-mission-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-emerald-400/35 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300/70">
              Мини-миссия
            </p>
            <h2
              id="terminal-mission-title"
              className="text-base font-semibold text-emerald-50"
            >
              Терминал связи
            </h2>
            <p className="mt-1 font-mono text-[11px] text-neutral-400">
              Включите рубильники в порядке: {targetLabels}
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-white/15 p-1.5 text-neutral-300 hover:bg-white/10"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-5">
          <div className="flex items-center justify-between font-mono text-[11px] text-neutral-400">
            <span>
              Шаг {Math.min(progress + 1, target.length)} / {target.length}
            </span>
            {errorFlash && (
              <span className="text-red-300">Сбой — начните сначала</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {SWITCH_LABELS.map((label, index) => {
              const done = target.slice(0, progress).includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  className={`rounded-lg border px-3 py-6 font-mono text-lg font-semibold transition ${
                    done
                      ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100'
                      : errorFlash
                        ? 'border-red-400/50 bg-red-500/10 text-red-100'
                        : 'border-white/20 bg-black/50 text-amber-100 hover:border-emerald-300/50 hover:bg-emerald-500/10'
                  }`}
                  onClick={() => onSwitch(index)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
            Ошибка сбрасывает последовательность. Escape — закрыть.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Host: opens when store has activePlacementId. */
export function StationMissionHost() {
  const activePlacementId = useStationMissionStore((s) => s.activePlacementId);
  const toast = useStationMissionStore((s) => s.toast);
  const close = useStationMissionStore((s) => s.close);
  const complete = useStationMissionStore((s) => s.complete);
  const clearToast = useStationMissionStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => clearToast(), 2800);
    return () => window.clearTimeout(t);
  }, [toast, clearToast]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {activePlacementId && (
        <TerminalMinigame
          placementId={activePlacementId}
          onClose={close}
          onComplete={(id) => {
            playUiSound('character');
            complete(id, 'Терминал связи настроен');
          }}
        />
      )}
      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[210] w-[min(92vw,22rem)] -translate-x-1/2 rounded-lg border border-emerald-400/40 bg-black/90 px-4 py-2.5 text-center font-mono text-[12px] text-emerald-100 shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}
    </>,
    document.body,
  );
}
