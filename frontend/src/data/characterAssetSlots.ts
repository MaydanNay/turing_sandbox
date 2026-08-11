import { ASSETS } from '@/config/assets';
import type { CharacterDefinition } from '@/data/characters';

/** Слоты изображений персонажа (DEV-редактор + ракурсы на сцене). */
export type CharacterAssetSlotId =
  | 'stand_left'
  | 'stand_right'
  | 'stand_front'
  | 'stand_back'
  | 'seated'
  | 'chat'
  | 'card';

export interface CharacterAssetSlot {
  id: CharacterAssetSlotId;
  label: string;
  group: 'poses' | 'scene' | 'ui';
  description: string;
  /** Путь относительно public/ */
  relPath: (character: CharacterDefinition) => string;
}

export const CHARACTER_ASSET_SLOTS: CharacterAssetSlot[] = [
  {
    id: 'stand_left',
    label: 'Смотрит влево',
    group: 'poses',
    description: 'Стойка / движение влево',
    relPath: (c) => `assets/characters/poses/${c.id}/left.png`,
  },
  {
    id: 'stand_right',
    label: 'Смотрит вправо',
    group: 'poses',
    description: 'Стойка / движение вправо',
    relPath: (c) => `assets/characters/poses/${c.id}/right.png`,
  },
  {
    id: 'stand_front',
    label: 'Лицом к камере',
    group: 'poses',
    description: 'Стойка лицом к игроку',
    relPath: (c) => `assets/characters/poses/${c.id}/front.png`,
  },
  {
    id: 'stand_back',
    label: 'Спиной',
    group: 'poses',
    description: 'Уходит вглубь сцены',
    relPath: (c) => `assets/characters/poses/${c.id}/back.png`,
  },
  {
    id: 'seated',
    label: 'Сидит за столом',
    group: 'scene',
    description: 'Стул + персонаж за круглым столом',
    relPath: (c) =>
      `assets/table/seats/occupied/${String(c.seat).padStart(2, '0')}_${c.id}.png`,
  },
  {
    id: 'chat',
    label: 'Портрет чата',
    group: 'ui',
    description: 'Крупный портрет в приватном чате',
    relPath: (c) => `assets/characters/chat/${c.id}_chat.png`,
  },
  {
    id: 'card',
    label: 'Карта персонажа',
    group: 'ui',
    description: 'Иллюстрация на карте «Персонаж»',
    relPath: (c) => `assets/cards/characters/${c.id}_card.png`,
  },
];

export function characterAssetUrl(
  character: CharacterDefinition,
  slotId: CharacterAssetSlotId,
  bust?: number,
): string {
  const slot = CHARACTER_ASSET_SLOTS.find((s) => s.id === slotId);
  const path = slot ? `/${slot.relPath(character)}` : ASSETS.characters.chibi(character.id);
  return bust ? `${path}?t=${bust}` : path;
}

export function characterAssetSlot(
  slotId: CharacterAssetSlotId,
): CharacterAssetSlot | undefined {
  return CHARACTER_ASSET_SLOTS.find((s) => s.id === slotId);
}

export const CHARACTER_ASSET_GROUPS: {
  id: CharacterAssetSlot['group'];
  label: string;
}[] = [
  { id: 'poses', label: 'Ракурсы на сцене' },
  { id: 'scene', label: 'Сцена и стол' },
  { id: 'ui', label: 'Интерфейс' },
];
