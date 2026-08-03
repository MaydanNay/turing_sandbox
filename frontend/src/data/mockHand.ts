import { ASSETS } from '@/config/assets';
import type { PlayerHandCard } from '@/types/card';

/** Мок руки для проверки вёрстки BottomHand */
export const MOCK_HAND_CARDS: PlayerHandCard[] = [
  {
    id: 'card-1',
    type: 'character',
    title: 'Рокси',
    description: 'Радистка',
    isRevealed: true,
    imageUrl: ASSETS.cards.character('roxy'),
  },
  {
    id: 'card-2',
    type: 'skill',
    title: 'Хакерство',
    description: 'Взлом терминалов и обход замков',
    isRevealed: true,
  },
  {
    id: 'card-3',
    type: 'biometrics',
    title: 'Тремор рук',
    description: 'Падает точность при тонкой работе',
    isRevealed: false,
  },
  {
    id: 'card-4',
    type: 'inventory',
    title: 'Колода карт',
    description: 'Старые игральные карты. Объективно мусор',
    isRevealed: false,
  },
  {
    id: 'card-5',
    type: 'trait',
    title: 'Патологический лжец',
    description: 'В стрессе всегда приукрашивает',
    isRevealed: false,
  },
  {
    id: 'card-6',
    type: 'secret_mission',
    title: 'Протокол: Симпатизант',
    description: 'Сделай так, чтобы Синтетик попал в Конвой',
    isRevealed: true,
  },
];
