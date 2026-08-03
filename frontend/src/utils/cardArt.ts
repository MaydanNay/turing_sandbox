import { ASSETS } from '@/config/assets';
import type { CardType, PlayerHandCard } from '@/types/card';

/** Явные slug для art-файлов `{slug}_card.png` */
const TITLE_ART_SLUG: Record<string, string> = {
  Хакерство: 'hacking',
  'Тремор рук': 'hand-tremor',
  'Колода карт': 'card-deck',
  'Патологический лжец': 'pathological-liar',
  'Протокол: Симпатизант': 'sympathizer-protocol',
};

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function cardArtSlug(title: string): string {
  return TITLE_ART_SLUG[title] ?? slugifyTitle(title);
}

/** Путь к art-карте: `/assets/cards/{type}/{slug}_card.png` */
export function cardArtPath(type: CardType, title: string): string {
  if (type === 'character') {
    const id = slugifyTitle(title);
    return ASSETS.cards.character(id);
  }
  return `/assets/cards/${type}/${cardArtSlug(title)}_card.png`;
}

export function resolveCardImageUrl(card: Pick<PlayerHandCard, 'type' | 'title' | 'imageUrl'>): string {
  return card.imageUrl ?? cardArtPath(card.type, card.title);
}

export function toRevealCardPayload(
  card: Pick<PlayerHandCard, 'type' | 'title' | 'description' | 'imageUrl'>,
) {
  return {
    cardType: card.type,
    cardTitle: card.title,
    cardDescription: card.description,
    cardImageUrl: resolveCardImageUrl(card),
  };
}

export function revealTypeLabel(type: CardType): string {
  switch (type) {
    case 'skill':
      return 'свой навык';
    case 'secret_mission':
      return 'миссию';
    case 'character':
      return 'персонажа';
    case 'biometrics':
      return 'биометрию';
    case 'inventory':
      return 'инвентарь';
    case 'trait':
      return 'фактор';
    default:
      return 'карту';
  }
}
