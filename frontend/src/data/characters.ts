import type { Gender } from '@/types/game';
import roster from '@/data/characterRoster.json';

export type CharacterStandFacing = 'left' | 'right' | 'front' | 'back';

export interface CharacterRosterEntry {
  seat: number;
  standFacing: CharacterStandFacing;
}

export type CharacterRoster = Record<string, CharacterRosterEntry>;

/** Единый источник id → seat / канонический ракурс (и для Vite upload-plugin). */
export const CHARACTER_ROSTER = roster as CharacterRoster;

export interface CharacterDefinition {
  id: string;
  displayName: string;
  /** Позиция за столом 1–8 (номер файла) */
  seat: number;
  gender: Gender;
  ageMin: number;
  ageMax: number;
  role: string;
}

function seatOf(id: string): number {
  const entry = CHARACTER_ROSTER[id];
  if (!entry) {
    throw new Error(`characterRoster.json: missing seat for "${id}"`);
  }
  return entry.seat;
}

/** Канонические 8 персонажей — id совпадает с именем файла occupied */
export const CHARACTERS: CharacterDefinition[] = [
  {
    id: 'vance',
    displayName: 'Vance',
    seat: seatOf('vance'),
    gender: 'male',
    ageMin: 38,
    ageMax: 52,
    role: 'Старожил',
  },
  {
    id: 'cole',
    displayName: 'Cole',
    seat: seatOf('cole'),
    gender: 'male',
    ageMin: 19,
    ageMax: 26,
    role: 'Сорванец',
  },
  {
    id: 'martha',
    displayName: 'Martha',
    seat: seatOf('martha'),
    gender: 'female',
    ageMin: 16,
    ageMax: 19,
    role: 'Бунтарка',
  },
  {
    id: 'penny',
    displayName: 'Penny',
    seat: seatOf('penny'),
    gender: 'male',
    ageMin: 58,
    ageMax: 72,
    role: 'Патриарх',
  },
  {
    id: 'gwen',
    displayName: 'Gwen',
    seat: seatOf('gwen'),
    gender: 'female',
    ageMin: 22,
    ageMax: 32,
    role: 'Беглец',
  },
  {
    id: 'logan',
    displayName: 'Logan',
    seat: seatOf('logan'),
    gender: 'female',
    ageMin: 60,
    ageMax: 90,
    role: 'Хранительница',
  },
  {
    id: 'chester',
    displayName: 'Chester',
    seat: seatOf('chester'),
    gender: 'female',
    ageMin: 9,
    ageMax: 13,
    role: 'Смельчакка',
  },
  {
    id: 'roxy',
    displayName: 'Roxy',
    seat: seatOf('roxy'),
    gender: 'female',
    ageMin: 20,
    ageMax: 28,
    role: 'Отшельница',
  },
];

export function getCharacterById(id: string): CharacterDefinition | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getCharacterBySeat(seat: number): CharacterDefinition | undefined {
  return CHARACTERS.find((c) => c.seat === seat);
}

export function characterStandFacing(id: string): CharacterStandFacing {
  return CHARACTER_ROSTER[id]?.standFacing ?? 'left';
}

/** Случайный возраст в диапазоне — один раз на сессию */
export function rollAge(character: CharacterDefinition): number {
  const span = character.ageMax - character.ageMin + 1;
  return character.ageMin + Math.floor(Math.random() * span);
}

/** Возрасты всех персонажей для новой сессии */
export function rollSessionAges(): Record<string, number> {
  const ages: Record<string, number> = {};
  for (const c of CHARACTERS) {
    ages[c.id] = rollAge(c);
  }
  return ages;
}

export function genderLabel(gender: Gender): string {
  return gender === 'male' ? 'М' : 'Ж';
}

/** Направление стойки по вектору движения (в % сцены). */
export function facingFromDelta(
  dx: number,
  dy: number,
  fallback: CharacterStandFacing,
): CharacterStandFacing {
  if (Math.hypot(dx, dy) < 0.05) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'back' : 'front';
}
