import type { CardType, PlayerHandCard } from '@/types/card';

const TYPE_LABELS: Record<CardType, string> = {
  character: 'Персонаж',
  skill: 'Навык',
  biometrics: 'Биометрия',
  inventory: 'Инвентарь',
  trait: 'Фактор',
  secret_mission: 'Миссия',
};

export function cardRevealLabel(card: PlayerHandCard): string {
  return `${TYPE_LABELS[card.type]}: ${card.title}`;
}
