import type { Gender } from '@/types/game';

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

/** Канонические 8 персонажей — id совпадает с именем файла occupied */
export const CHARACTERS: CharacterDefinition[] = [
  {
    id: 'vance',
    displayName: 'Vance',
    seat: 1,
    gender: 'male',
    ageMin: 38,
    ageMax: 52,
    role: 'Старожил',
  },
  {
    id: 'cole',
    displayName: 'Cole',
    seat: 2,
    gender: 'male',
    ageMin: 19,
    ageMax: 26,
    role: 'Сорванец',
  },
  {
    id: 'martha',
    displayName: 'Martha',
    seat: 3,
    gender: 'female',
    ageMin: 16,
    ageMax: 19,
    role: 'Бунтарка',
  },
  {
    id: 'penny',
    displayName: 'Penny',
    seat: 4,
    gender: 'male',
    ageMin: 58,
    ageMax: 72,
    role: 'Патриарх',
  },
  {
    id: 'gwen',
    displayName: 'Gwen',
    seat: 5,
    gender: 'female',
    ageMin: 22,
    ageMax: 32,
    role: 'Беглец',
  },
  {
    id: 'logan',
    displayName: 'Logan',
    seat: 6,
    gender: 'female',
    ageMin: 60,
    ageMax: 90,
    role: 'Хранительница',
  },
  {
    id: 'chester',
    displayName: 'Chester',
    seat: 7,
    gender: 'female',
    ageMin: 9,
    ageMax: 13,
    role: 'Смельчакка',
  },
  {
    id: 'roxy',
    displayName: 'Roxy',
    seat: 8,
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
