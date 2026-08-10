import { motion } from 'framer-motion';
import { Clock, Vote } from 'lucide-react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import {
  GAME_PHASE_CONFIG,
  getPhaseCountdownConfig,
  getPhaseMeta,
  isInVoteWindow,
  isRevealPhase,
} from '@/data/gamePhaseConfig';
import type { HudPlayerSlot } from '@/data/mockHud';
import { useDeadlineCountdown, usePhaseCountdown } from '@/hooks/usePhaseCountdown';
import type { GamePhase } from '@/types/game';
import { revealTypeLabel } from '@/utils/cardArt';
import type { CardType } from '@/types/card';

const PINSTRIPE_BG = `#F5E6A8 repeating-linear-gradient(
  0deg,
  transparent,
  transparent 3px,
  rgba(0,0,0,0.035) 3px,
  rgba(0,0,0,0.035) 4px
)`;

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ProcessPortrait({ characterId, name }: { characterId: string; name: string }) {
  const src = hasCharacterCard(characterId)
    ? ASSETS.cards.character(characterId)
    : ASSETS.characters.chibi(characterId);

  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-neutral-900/12 bg-neutral-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover object-top"
        draggable={false}
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

function CountdownBadge({
  seconds,
  urgentBelow = 10,
  label,
}: {
  seconds: number;
  urgentBelow?: number;
  label?: string;
}) {
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
      {label && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      )}
      <span className="font-semibold tracking-wide">{formatCountdown(seconds)}</span>
    </motion.div>
  );
}

export interface GameProcessPanelProps {
  phase: GamePhase;
  revealPlayer?: HudPlayerSlot | null;
  isMyRevealTurn?: boolean;
  gatheredAtTable?: boolean;
  forceVoting?: boolean;
  /** Server unix-seconds deadline; when set, HUD follows the server clock */
  phaseDeadlineTs?: number | null;
  phaseDurationSec?: number | null;
  revealDeadlineTs?: number | null;
  revealCardType?: string | null;
}

export function GameProcessPanel({
  phase,
  revealPlayer,
  isMyRevealTurn = false,
  gatheredAtTable = true,
  forceVoting = false,
  phaseDeadlineTs = null,
  phaseDurationSec = null,
  revealDeadlineTs = null,
  revealCardType = null,
}: GameProcessPanelProps) {
  const meta = getPhaseMeta(phase);
  const revealCharacterId =
    revealPlayer && isRevealPhase(phase) ? revealPlayer.id : null;

  const {
    resetKey,
    initialSeconds,
    showReveal: revealTurnClock,
  } = getPhaseCountdownConfig(phase, gatheredAtTable, revealCharacterId);

  const localRemaining = usePhaseCountdown(initialSeconds, resetKey);
  const serverPhaseRemaining = useDeadlineCountdown(phaseDeadlineTs);
  const serverRevealRemaining = useDeadlineCountdown(revealDeadlineTs);
  const useRevealClock = revealTurnClock && revealDeadlineTs != null;
  const useServerPhaseClock = phaseDeadlineTs != null && !useRevealClock;
  const remaining = useRevealClock
    ? serverRevealRemaining
    : useServerPhaseClock
      ? serverPhaseRemaining
      : localRemaining;
  const voting = forceVoting || isInVoteWindow(phase, remaining, phaseDurationSec);

  const showReveal =
    gatheredAtTable && revealPlayer != null && isRevealPhase(phase) && !voting;

  let title: string;
  let subtitle: string;
  let showTimer =
    useRevealClock || useServerPhaseClock || initialSeconds > 0;
  let timerLabel: string | undefined;
  let urgentBelow = 10;

  if (!gatheredAtTable) {
    if (useServerPhaseClock || phase === 'INIT') {
      title = meta.title;
      subtitle =
        phase === 'INIT' ? meta.subtitle : `${meta.subtitle} · подойдите к столу`;
      showTimer = useServerPhaseClock || meta.durationSeconds > 0;
      timerLabel =
        meta.round != null && meta.round > 0 ? `Раунд ${meta.round}` : 'Фаза';
    } else {
      title = 'Сбор у аванпоста';
      subtitle = 'Ожидание за столом';
      showTimer = false;
    }
  } else if (showReveal && revealPlayer) {
    title = revealPlayer.name;
    const typeHint = revealCardType
      ? revealTypeLabel(revealCardType as CardType)
      : 'карту';
    subtitle = isMyRevealTurn
      ? `Обязательное вскрытие: ${typeHint}`
      : `Очередь открывать ${typeHint}`;
    timerLabel = `Раунд ${meta.round ?? '—'}`;
    urgentBelow = 8;
  } else if (voting) {
    title = 'Голосование';
    subtitle = 'Выберите, кого отправить в Карцер';
    timerLabel = 'Голосование';
    urgentBelow = 15;
  } else {
    title = meta.title;
    subtitle = meta.subtitle;
    if (meta.round != null && meta.round > 0) {
      timerLabel = `Раунд ${meta.round}`;
    } else if (phase === 'INIT') {
      timerLabel = 'Фаза 0';
    } else if (phase === 'RESOLVE') {
      timerLabel = 'Эпилог';
    }
  }

  const hasLeadingIcon = Boolean(
    (showReveal && revealPlayer) || voting || phase === 'VOTE',
  );

  return (
    <div
      className="relative m-3 overflow-hidden rounded-2xl border border-neutral-900/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(0,0,0,0.12)]"
      style={{ background: PINSTRIPE_BG }}
    >
      <div className="flex items-start gap-2.5">
        {showReveal && revealPlayer ? (
          <ProcessPortrait characterId={revealPlayer.id} name={revealPlayer.name} />
        ) : voting || phase === 'VOTE' ? (
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
          <CountdownBadge seconds={remaining} urgentBelow={urgentBelow} label={timerLabel} />
        </div>
      )}

      {showTimer && remaining === 0 && (
        <p
          className={`mt-2.5 text-[11px] text-neutral-500 ${hasLeadingIcon ? 'pl-[3.25rem]' : ''}`}
        >
          Время фазы истекло
        </p>
      )}
    </div>
  );
}

export function formatPhaseLabel(phase: GamePhase): string {
  const meta = GAME_PHASE_CONFIG[phase];
  if (meta.round != null && meta.round > 0) {
    return `R${meta.round} · ${meta.title}`;
  }
  return meta.title;
}
