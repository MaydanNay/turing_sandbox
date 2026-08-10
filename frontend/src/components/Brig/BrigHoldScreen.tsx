import { useDeadlineCountdown } from '@/hooks/usePhaseCountdown';

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface BrigHoldScreenProps {
  /** Boarding still running (RESOLVE before match_ended) */
  waitingForConvoy: boolean;
  phaseDeadlineTs: number | null;
  /** After audit: short outcome line, or null while boarding */
  outcomeLine?: string | null;
  onLeave?: () => void;
}

/**
 * Карцер: пустой чёрный экран. Игрок ждёт закрытия шлюза или выходит в лобби.
 * Leave здесь не заканчивает матч для остальных — только disconnect клиента.
 */
export function BrigHoldScreen({
  waitingForConvoy,
  phaseDeadlineTs,
  outcomeLine = null,
  onLeave,
}: BrigHoldScreenProps) {
  const remaining = useDeadlineCountdown(phaseDeadlineTs);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[12000] flex flex-col bg-black">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-white/35">
          Карцер
        </p>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
          {waitingForConvoy
            ? phaseDeadlineTs != null
              ? 'Изоляция до отбытия Конвоя. Экран пуст — вы вне игры за столом.'
              : 'Вы в Карцере. Изоляция до Конвоя — стол идёт без вас.'
            : 'Конвой ушёл. Вы остались в Карцере.'}
        </p>
        {waitingForConvoy && phaseDeadlineTs != null && (
          <p className="mt-8 font-mono text-3xl tabular-nums text-white/40">
            {formatCountdown(remaining)}
          </p>
        )}
        {outcomeLine && (
          <p className="mt-6 max-w-md text-sm text-white/70">{outcomeLine}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 px-6 pb-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {waitingForConvoy && (
          <p className="text-center text-[11px] text-white/30">
            Ждать — просто оставайтесь на экране. Выйти — только ваш клиент, матч для остальных
            продолжается.
          </p>
        )}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white/80 transition hover:border-white/40 hover:bg-white/10"
          >
            Выйти в лобби
          </button>
        )}
      </div>
    </div>
  );
}
