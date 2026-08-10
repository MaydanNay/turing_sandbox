import { useDeadlineCountdown } from '@/hooks/usePhaseCountdown';
import type { EpilogueReport } from '@/types/game';

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface EpilogueOverlayProps {
  boarding: boolean;
  phaseDeadlineTs: number | null;
  report: EpilogueReport | null;
  onLeave?: () => void;
}

/**
 * Экран Конвоя (живые, не в Карцере): текст посадки, затем победа/проигрыш.
 */
export function EpilogueOverlay({
  boarding,
  phaseDeadlineTs,
  report,
  onLeave,
}: EpilogueOverlayProps) {
  const remaining = useDeadlineCountdown(phaseDeadlineTs);

  if (boarding && !report) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-[12000] flex flex-col bg-neutral-950/92 px-6">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/70">
            Конвой
          </p>
          <h2 className="mt-4 font-serif text-3xl text-amber-50">Вы на борту</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
            Шлюз ещё открыт. После закрытия станет ясно, проникли ли Синтетики вместе с вами.
          </p>
          <p className="mt-8 font-mono text-4xl tabular-nums text-amber-200/90">
            {formatCountdown(remaining)}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-600">
            до закрытия шлюза
          </p>
        </div>
        {onLeave && (
          <div className="mx-auto w-full max-w-sm pb-10">
            <button
              type="button"
              onClick={onLeave}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 transition hover:border-white/30 hover:bg-white/10"
            >
              Выйти в лобби
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!report) return null;

  const x = report.synthetics_in_convoy;
  const won = (report.winning_team ?? '').toUpperCase() === 'HUMAN';

  return (
    <div className="pointer-events-auto absolute inset-0 z-[12000] flex items-center justify-center bg-neutral-950/95 px-6">
      <div className="w-full max-w-lg text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300/70">
          Проверка завершена
        </p>
        <h2
          className={`mt-4 font-serif text-4xl ${
            won ? 'text-emerald-200' : 'text-red-300'
          }`}
        >
          {won ? 'Победа' : 'Проигрыш'}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-neutral-300">
          В Конвой проникло {x}{' '}
          {x === 1 ? 'Синтетик' : x >= 2 && x <= 4 ? 'Синтетика' : 'Синтетиков'}.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          {won
            ? 'Тест пройден — среди уехавших нет Синтетиков.'
            : 'Тест провален — Синтетик оказался на борту.'}
        </p>

        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="mt-10 w-full rounded-lg border border-amber-300/40 bg-amber-500/15 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25"
          >
            В лобби
          </button>
        )}
      </div>
    </div>
  );
}
