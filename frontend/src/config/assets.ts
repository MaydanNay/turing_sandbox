/**
 * Пути к игровым ассетам (public/assets/).
 *
 * Стулья: table/seats/empty/01.png … 08.png
 * С персонажем: table/seats/occupied/01_vance.png
 */

import {
  characterStandFacing,
  type CharacterStandFacing,
} from '@/data/characters';

export type { CharacterStandFacing };

export const ASSETS = {
  locations: {
    outpost: '/assets/locations/outpost.jpg',
    outpostNight: '/assets/locations/outpost-night.png',
    menu: '/assets/locations/menu.png',
    brig: '/assets/locations/brig.png',
  },
  table: {
    round: '/assets/table/table.png',
    /** Пустой стул на позиции 1–8 (вид с соответствующего ракурса) */
    seatEmpty: (position: number) =>
      `/assets/table/seats/empty/${String(position).padStart(2, '0')}.png`,
    /** Стул + персонаж: 01_vance, 02_cole, … */
    seatOccupied: (position: number, characterId: string) =>
      `/assets/table/seats/occupied/${String(position).padStart(2, '0')}_${characterId}.png`,
  },
  characters: {
    /** Ракурс стойки на сцене */
    pose: (id: string, facing: CharacterStandFacing) =>
      `/assets/characters/poses/${id}/${facing}.png`,
    /**
     * Стоячий спрайт по умолчанию (канонический ракурс из characterRoster.json).
     */
    chibi: (id: string) => ASSETS.characters.pose(id, characterStandFacing(id)),
    /** Полноразмерный портрет для экрана приватного чата (кулуары) */
    chat: (id: string) => `/assets/characters/chat/${id}_chat.png`,
    default: '/assets/characters/poses/default.png',
    /** slug → id для occupied-спрайтов (Капитан → captain) */
    slug: (name: string) =>
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'unknown',
  },
  cards: {
    playerFrame: '/assets/cards/player-frame.png',
    rejectedStamp: '/assets/cards/rejected-stamp.png',
    /** Иллюстрация на лицевой стороне карты «Персонаж» */
    character: (id: string) => `/assets/cards/characters/${id}_card.png`,
  },
  ui: {
    scanlines: '/assets/ui/scanlines.png',
    logo: '/assets/ui/logo.png',
  },
} as const;

/** Персонажи с портретом в `characters/chat/{id}_chat.png` */
export const CHAT_PORTRAIT_IDS = [
  'vance',
  'cole',
  'martha',
  'penny',
  'gwen',
  'logan',
  'chester',
  'roxy',
] as const;

export function hasChatPortrait(characterId: string): boolean {
  return (CHAT_PORTRAIT_IDS as readonly string[]).includes(characterId);
}

/** Персонажи с иллюстрацией на карте в `cards/characters/{id}_card.png` */
export const CHARACTER_CARD_IDS = [
  'vance',
  'cole',
  'martha',
  'penny',
  'gwen',
  'logan',
  'chester',
  'roxy',
] as const;

export function hasCharacterCard(characterId: string): boolean {
  return (CHARACTER_CARD_IDS as readonly string[]).includes(characterId);
}

export function seatSprite(
  position: number,
  characterId: string | null,
  occupied: boolean,
): string {
  if (occupied && characterId) {
    return ASSETS.table.seatOccupied(position, characterId);
  }
  return ASSETS.table.seatEmpty(position);
}

/** Проверка наличия картинки перед подстановкой (fallback на CSS/иконки) */
export async function assetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
