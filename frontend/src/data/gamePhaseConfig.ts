import type { CardType } from '@/types/card';
import type { GamePhase } from '@/types/game';

export interface GamePhaseMeta {
  /** Номер раунда (0 — инициализация, null — эпилог) */
  round: number | null;
  title: string;
  subtitle: string;
  /** Длительность фазы в секундах */
  durationSeconds: number;
  /** Последние N секунд раунда — окно голосования */
  voteWindowSeconds?: number;
  /** Какую карту вскрывают в этом раунде */
  revealCardType?: Exclude<CardType, 'character' | 'secret_mission'>;
  format: 'lobby' | 'table' | 'private' | 'epilogue';
}

/** Тайминг и описания этапов матча (см. docs / game design) */
export const GAME_PHASE_CONFIG: Record<GamePhase, GamePhaseMeta> = {
  INIT: {
    round: 0,
    title: 'Инициализация терминала',
    subtitle: 'Кулуары открыты · нажмите на персонажа',
    durationSeconds: 60,
    format: 'lobby',
  },
  PITCH: {
    round: 1,
    title: 'Идентификация',
    subtitle: 'Раунд 1 · общий чат · вскрыть Навык',
    durationSeconds: 7 * 60,
    revealCardType: 'skill',
    format: 'table',
  },
  RECESS: {
    round: 2,
    title: 'Кулуары',
    subtitle: 'Раунд 2 · только приватные чаты · общий стол закрыт',
    durationSeconds: 5 * 60,
    format: 'private',
  },
  CONFLICT: {
    round: 3,
    title: 'Фактор риска',
    subtitle: 'Раунд 3 · общий чат · вскрыть Биометрию',
    durationSeconds: 7 * 60,
    voteWindowSeconds: 60,
    revealCardType: 'biometrics',
    format: 'table',
  },
  REVISION: {
    round: 4,
    title: 'Ревизия',
    subtitle: 'Раунд 4 · вскрыть Инвентарь · второе голосование',
    durationSeconds: 6 * 60,
    voteWindowSeconds: 60,
    revealCardType: 'inventory',
    format: 'table',
  },
  TURING: {
    round: 5,
    title: 'Тест Тьюринга',
    subtitle: 'Раунд 5 · Человеческий фактор · финальное голосование',
    durationSeconds: 5 * 60,
    voteWindowSeconds: 60,
    revealCardType: 'trait',
    format: 'table',
  },
  VOTE: {
    round: null,
    title: 'Голосование',
    subtitle: 'Выберите кандидата в Карцер',
    durationSeconds: 60,
    format: 'table',
  },
  RESOLVE: {
    round: null,
    title: 'Эпилог',
    subtitle: 'Прибытие Конвоя · итоги матча',
    durationSeconds: 60,
    format: 'epilogue',
  },
};

/** Порядок фаз полного матча (без отдельной VOTE — голосование внутри раундов 3–5) */
export const MATCH_PHASE_ORDER: GamePhase[] = [
  'INIT',
  'PITCH',
  'RECESS',
  'CONFLICT',
  'REVISION',
  'TURING',
  'RESOLVE',
];

/** Время на одного игрока при принудительном вскрытии карты */
export const REVEAL_TURN_SECONDS = 45;

/** Сколько игроков нужно отправить в карцер за матч */
export const BRIG_CAPACITY = 3;

export interface PhaseCountdownConfig {
  resetKey: string;
  initialSeconds: number;
  showReveal: boolean;
}

export function getPhaseCountdownConfig(
  phase: GamePhase,
  gatheredAtTable: boolean,
  revealCharacterId: string | null,
): PhaseCountdownConfig {
  const showReveal =
    gatheredAtTable && revealCharacterId != null && isRevealPhase(phase);

  if (showReveal && revealCharacterId) {
    return {
      showReveal: true,
      resetKey: `reveal-${revealCharacterId}-${phase}`,
      initialSeconds: REVEAL_TURN_SECONDS,
    };
  }

  const meta = getPhaseMeta(phase);
  return {
    showReveal: false,
    resetKey: `phase-${phase}`,
    initialSeconds: gatheredAtTable || phase === 'INIT' ? meta.durationSeconds : 0,
  };
}

export function getPhaseMeta(phase: GamePhase): GamePhaseMeta {
  return GAME_PHASE_CONFIG[phase];
}

export function isRevealPhase(phase: GamePhase): boolean {
  return Boolean(GAME_PHASE_CONFIG[phase].revealCardType);
}

export function isInVoteWindow(phase: GamePhase, remainingSeconds: number): boolean {
  if (phase === 'VOTE') return remainingSeconds > 0;
  const voteWindow = GAME_PHASE_CONFIG[phase].voteWindowSeconds;
  if (!voteWindow) return false;
  return remainingSeconds > 0 && remainingSeconds <= voteWindow;
}

export function totalMatchDurationSeconds(): number {
  return MATCH_PHASE_ORDER.reduce(
    (sum, phase) => sum + GAME_PHASE_CONFIG[phase].durationSeconds,
    0,
  );
}
