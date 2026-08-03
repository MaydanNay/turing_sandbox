export type CardType =
  | 'character'
  | 'skill'
  | 'biometrics'
  | 'inventory'
  | 'trait'
  | 'secret_mission';

export interface PlayerHandCard {
  id: string;
  type: CardType;
  title: string;
  description: string;
  isRevealed: boolean;
  /** Портрет персонажа на карте type === 'character' */
  imageUrl?: string;
}

/** В руке игрока всегда ровно 6 карт */
export const HAND_SIZE = 6;

export function assertHandSize(cards: readonly PlayerHandCard[]): asserts cards is [
  PlayerHandCard,
  PlayerHandCard,
  PlayerHandCard,
  PlayerHandCard,
  PlayerHandCard,
  PlayerHandCard,
] {
  if (cards.length !== HAND_SIZE) {
    throw new Error(`Hand must contain exactly ${HAND_SIZE} cards, got ${cards.length}`);
  }
}
