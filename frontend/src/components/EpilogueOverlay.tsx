import { useEffect, useState } from 'react';

import { BRIG_CAPACITY } from '@/data/gamePhaseConfig';
import { useDeadlineCountdown } from '@/hooks/usePhaseCountdown';
import { useT } from '@/i18n';
import type { EpilogueReport } from '@/types/game';

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function synthWord(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

interface EpilogueOverlayProps {
  boarding: boolean;
  phaseDeadlineTs: number | null;
  brigFilled: number;
  report: EpilogueReport | null;
  onLeave?: () => void;
}

/**
 * Посадка Конвоя (A+B): прибытие + таймер + кворум Карцера.
 * Пока идёт посадка — стол остаётся играбельным (баннер).
 * «В лобби» только после аудита.
 */
export function EpilogueOverlay({
  boarding,
  phaseDeadlineTs,
  brigFilled,
  report,
  onLeave,
}: EpilogueOverlayProps) {
  const t = useT();
  const remaining = useDeadlineCountdown(phaseDeadlineTs);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const brigReady = brigFilled >= BRIG_CAPACITY;

  useEffect(() => {
    setArrivalDismissed(false);
  }, [boarding, phaseDeadlineTs]);

  useEffect(() => {
    if (!boarding || report || arrivalDismissed) return;
    const id = window.setTimeout(() => setArrivalDismissed(true), 5500);
    return () => window.clearTimeout(id);
  }, [boarding, report, arrivalDismissed]);

  if (boarding && !report) {
    const showArrival = !arrivalDismissed;

    return (
      <>
        {showArrival && (
          <div className="pointer-events-auto absolute inset-0 z-[12000] flex flex-col bg-neutral-950/94 px-6">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/70">
                {t('game.convoyLabel')}
              </p>
              <h2 className="mt-4 font-serif text-3xl text-amber-50 sm:text-4xl">
                {t('game.convoyArrived')}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
                {t('game.convoyArrivedHint')}
              </p>
              <p className="mt-8 font-mono text-4xl tabular-nums text-amber-200/90">
                {formatCountdown(remaining)}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-600">
                {t('game.convoyLeavesIn')}
              </p>
              <p className="mt-6 max-w-sm text-xs leading-relaxed text-amber-200/60">
                {t('game.convoyBrigQuorum', {
                  filled: String(Math.min(brigFilled, BRIG_CAPACITY)),
                  capacity: String(BRIG_CAPACITY),
                })}
              </p>
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-red-300/70">
                {t('game.convoySynthLose')}
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm pb-10">
              <button
                type="button"
                onClick={() => setArrivalDismissed(true)}
                className="w-full rounded-lg border border-amber-300/40 bg-amber-500/15 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25"
              >
                {t('game.convoyContinue')}
              </button>
            </div>
          </div>
        )}

        {!showArrival && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[12000] flex justify-center px-3 pt-3">
            <div className="pointer-events-none max-w-xl rounded-lg border border-amber-300/25 bg-neutral-950/85 px-4 py-3 text-center shadow-lg backdrop-blur-md">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/75">
                {t('game.convoyArrived')}
              </p>
              <p className="mt-1 font-mono text-2xl tabular-nums text-amber-100">
                {formatCountdown(remaining)}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">
                {brigReady
                  ? t('game.convoyReadyToLeave')
                  : t('game.convoyBrigQuorum', {
                      filled: String(Math.min(brigFilled, BRIG_CAPACITY)),
                      capacity: String(BRIG_CAPACITY),
                    })}
              </p>
              <p className="mt-1 text-[10px] text-red-300/65">{t('game.convoySynthLose')}</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!report) return null;

  const x = report.synthetics_in_convoy;
  const won = (report.winning_team ?? '').toUpperCase() === 'HUMAN';
  const synthLabel = synthWord(
    x,
    t('game.synthOne'),
    t('game.synthFew'),
    t('game.synthMany'),
  );

  return (
    <div className="pointer-events-auto absolute inset-0 z-[12000] flex items-center justify-center bg-neutral-950/95 px-6">
      <div className="w-full max-w-lg text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/70">
          {t('game.auditDone')}
        </p>
        <h2
          className={`mt-4 font-serif text-4xl ${
            won ? 'text-emerald-200' : 'text-red-300'
          }`}
        >
          {won ? t('game.victory') : t('game.defeat')}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-neutral-300">
          {t('game.synthInConvoy', { count: String(x), word: synthLabel })}
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          {won ? t('game.auditPass') : t('game.auditFail')}
        </p>
        {!won && (
          <p className="mt-3 text-xs leading-relaxed text-red-300/80">
            {t('game.convoySynthLose')}
          </p>
        )}

        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="mt-10 w-full rounded-lg border border-amber-300/40 bg-amber-500/15 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25"
          >
            {t('game.toLobby')}
          </button>
        )}
      </div>
    </div>
  );
}
