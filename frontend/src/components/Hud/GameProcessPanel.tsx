import { motion } from 'framer-motion';
import { Clock, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import type { HudPlayerSlot } from '@/data/mockHud';
import type { GamePhase } from '@/types/game';

const PINSTRIPE_BG = `#F5E6A8 repeating-linear-gradient(
  0deg,
  transparent,
  transparent 3px,
  rgba(0,0,0,0.035) 3px,
  rgba(0,0,0,0.035) 4px
)`;

const PHASE_DURATION: Partial<Record<GamePhase, number>> = {
  PITCH: 180,
  CONFLICT: 120,
  VOTE: 30,
  RESOLVE: 20,
};

const REVEAL_TURN_SECONDS = 45;

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function useCountdown(initialSeconds: number, resetKey: string) {
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

function ProcessPortrait({ characterId, name }: { characterId: string; name: string }) {
  const [src, setSrc] = useState(() =>
    hasCharacterCard(characterId)
      ? ASSETS.cards.character(characterId)
      : ASSETS.characters.chibi(characterId),
  );

  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-neutral-900/12 bg-neutral-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover object-top"
        draggable={false}
        onError={() => setSrc(ASSETS.characters.chibi(characterId))}
      />
    </div>
  );
}

function PhaseIcon() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-neutral-900/10 bg-neutral-900/[0.06] shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
      <Vote className="h-5 w-5 text-neutral-800/80" />
    </div>
  );
}

function CountdownBadge({ seconds, urgentBelow = 10 }: { seconds: number; urgentBelow?: number }) {
  const urgent = seconds <= urgentBelow;

  return (
    <motion.div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs tabular-nums ${
        urgent
          ? 'border-red-300/50 bg-red-50/90 text-red-700'
          : 'border-neutral-900/10 bg-neutral-900/[0.06] text-neutral-800'
      }`}
      animate={urgent ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : undefined}
    >
      <Clock className={`h-3 w-3 shrink-0 ${urgent ? 'text-red-500/80' : 'text-neutral-600/70'}`} />
      <span className="font-semibold tracking-wide">{formatCountdown(seconds)}</span>
    </motion.div>
  );
}

export interface GameProcessPanelProps {
  phase: GamePhase;
  revealPlayer?: HudPlayerSlot | null;
  isMyRevealTurn?: boolean;
  gatheredAtTable?: boolean;
}

export function GameProcessPanel({
  phase,
  revealPlayer,
  isMyRevealTurn = false,
  gatheredAtTable = true,
}: GameProcessPanelProps) {
  const showReveal =
    gatheredAtTable &&
    revealPlayer != null &&
    (phase === 'PITCH' || phase === 'CONFLICT' || phase === 'INIT');

  const resetKey = showReveal
    ? `reveal-${revealPlayer?.id}`
    : `phase-${phase}`;

  const initialSeconds = showReveal
    ? REVEAL_TURN_SECONDS
    : PHASE_DURATION[phase] ?? 0;

  const remaining = useCountdown(initialSeconds, resetKey);

  let title: string;
  let subtitle: string;
  let showTimer = initialSeconds > 0;

  if (!gatheredAtTable) {
    title = 'Сбор у аванпоста';
    subtitle = 'Ожидание за столом';
    showTimer = false;
  } else if (showReveal && revealPlayer) {
    title = revealPlayer.name;
    subtitle = isMyRevealTurn ? 'Ваша очередь · откройте карту' : 'Очередь открывать карту';
  } else {
    switch (phase) {
      case 'VOTE':
        title = 'Голосование';
        subtitle = remaining > 0 ? 'Осталось времени' : 'Голосование завершено';
        break;
      case 'PITCH':
        title = 'Обсуждение';
        subtitle = 'Фаза питчинга';
        break;
      case 'CONFLICT':
        title = 'Конфликт';
        subtitle = 'Спорные моменты';
        break;
      case 'RESOLVE':
        title = 'Итоги';
        subtitle = 'Подведение результатов';
        break;
      default:
        title = 'Ожидание';
        subtitle = 'Игра готовится к старту';
        showTimer = false;
    }
  }

  const hasLeadingIcon = Boolean((showReveal && revealPlayer) || phase === 'VOTE');

  return (
    <div
      className="relative m-3 overflow-hidden rounded-2xl border border-neutral-900/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(0,0,0,0.12)]"
      style={{ background: PINSTRIPE_BG }}
    >
      <div className="flex items-start gap-2.5">
        {showReveal && revealPlayer ? (
          <ProcessPortrait characterId={revealPlayer.id} name={revealPlayer.name} />
        ) : phase === 'VOTE' ? (
          <PhaseIcon />
        ) : null}

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[13px] font-semibold capitalize leading-tight text-neutral-900">
            {title}
          </p>
          <p className="mt-1 text-[11px] leading-[1.35] text-neutral-600">{subtitle}</p>
        </div>
      </div>

      {showTimer && remaining > 0 && (
        <div className={`mt-2.5 ${hasLeadingIcon ? 'pl-[3.25rem]' : ''}`}>
          <CountdownBadge seconds={remaining} />
        </div>
      )}
    </div>
  );
}
