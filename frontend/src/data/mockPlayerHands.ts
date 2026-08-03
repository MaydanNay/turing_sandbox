import { ASSETS, hasCharacterCard } from '@/config/assets';
import { CHARACTERS } from '@/data/characters';
import type { PlayerHandCard } from '@/types/card';

function characterCard(
  characterId: string,
  revealed: boolean,
): PlayerHandCard {
  const character = CHARACTERS.find((c) => c.id === characterId)!;
  return {
    id: `${characterId}-character`,
    type: 'character',
    title: character.displayName,
    description: character.role,
    isRevealed: revealed,
    imageUrl: hasCharacterCard(characterId)
      ? ASSETS.cards.character(characterId)
      : ASSETS.characters.chibi(characterId),
  };
}

/** Мок рук всех персонажей — те же 6 карт, что у игрока за столом */
export const MOCK_PLAYER_HANDS: Record<string, PlayerHandCard[]> = {
  vance: [
    characterCard('vance', true),
    {
      id: 'vance-skill',
      type: 'skill',
      title: 'Старожил станции',
      description: 'Знает схемы вентиляции и служебные ходы',
      isRevealed: false,
    },
    {
      id: 'vance-bio',
      type: 'biometrics',
      title: 'Шрам на ладони',
      description: 'Старый ожог от короткого замыкания',
      isRevealed: false,
    },
    {
      id: 'vance-inv',
      type: 'inventory',
      title: 'Ключ-карта',
      description: 'Доступ в технический сектор B',
      isRevealed: false,
    },
    {
      id: 'vance-trait',
      type: 'trait',
      title: 'Старожил',
      description: 'На станции с первых дней экспедиции',
      isRevealed: true,
    },
    {
      id: 'vance-mission',
      type: 'secret_mission',
      title: 'Протокол: Хранитель',
      description: 'Не допусти эвакуации подозреваемого',
      isRevealed: false,
    },
  ],
  cole: [
    characterCard('cole', true),
    {
      id: 'cole-skill',
      type: 'skill',
      title: 'Взлом замков',
      description: 'Открывает механические и электронные запоры',
      isRevealed: false,
    },
    {
      id: 'cole-bio',
      type: 'biometrics',
      title: 'Тремор рук',
      description: 'Падает точность при тонкой работе',
      isRevealed: true,
    },
    {
      id: 'cole-inv',
      type: 'inventory',
      title: 'Отмычки',
      description: 'Самодельный набор для вскрытия',
      isRevealed: true,
    },
    {
      id: 'cole-trait',
      type: 'trait',
      title: 'Сорванец',
      description: 'Действует импульсивно, не любит правила',
      isRevealed: false,
    },
    {
      id: 'cole-mission',
      type: 'secret_mission',
      title: 'Протокол: Диверсант',
      description: 'Саботируй голосование против синтетика',
      isRevealed: false,
    },
  ],
  martha: [
    characterCard('martha', true),
    {
      id: 'martha-skill',
      type: 'skill',
      title: 'Агитация',
      description: 'Может склонить группу к своей версии',
      isRevealed: true,
    },
    {
      id: 'martha-bio',
      type: 'biometrics',
      title: 'Кибер-имплант',
      description: 'Бионический глаз с записью окружения',
      isRevealed: false,
    },
    {
      id: 'martha-inv',
      type: 'inventory',
      title: 'Графити-спрей',
      description: 'Оставляет метки на стенах секторов',
      isRevealed: false,
    },
    {
      id: 'martha-trait',
      type: 'trait',
      title: 'Бунтарка',
      description: 'Оспаривает любую официальную версию',
      isRevealed: true,
    },
    {
      id: 'martha-mission',
      type: 'secret_mission',
      title: 'Протокол: Провокатор',
      description: 'Вызови досрочное голосование',
      isRevealed: false,
    },
  ],
  penny: [
    characterCard('penny', false),
    {
      id: 'penny-skill',
      type: 'skill',
      title: 'Медицина',
      description: 'Стабилизирует раненых и читает симптомы',
      isRevealed: false,
    },
    {
      id: 'penny-bio',
      type: 'biometrics',
      title: 'Аритмия',
      description: 'Периодические скачки пульса под нагрузкой',
      isRevealed: false,
    },
    {
      id: 'penny-inv',
      type: 'inventory',
      title: 'Аптечка',
      description: 'Базовый набор перевязочных материалов',
      isRevealed: false,
    },
    {
      id: 'penny-trait',
      type: 'trait',
      title: 'Патриарх',
      description: 'Привык командовать и защищать своих',
      isRevealed: false,
    },
    {
      id: 'penny-mission',
      type: 'secret_mission',
      title: 'Протокол: Наставник',
      description: 'Убеди группу сохранить порядок',
      isRevealed: false,
    },
  ],
  gwen: [
    characterCard('gwen', true),
    {
      id: 'gwen-skill',
      type: 'skill',
      title: 'Скрытность',
      description: 'Проходит незамеченной через патрули',
      isRevealed: false,
    },
    {
      id: 'gwen-bio',
      type: 'biometrics',
      title: 'Холодные конечности',
      description: 'Температура тела ниже нормы',
      isRevealed: false,
    },
    {
      id: 'gwen-inv',
      type: 'inventory',
      title: 'Компас',
      description: 'Старый механический, всегда при себе',
      isRevealed: false,
    },
    {
      id: 'gwen-trait',
      type: 'trait',
      title: 'Беглец',
      description: 'Привыкла исчезать до начала разбирательств',
      isRevealed: false,
    },
    {
      id: 'gwen-mission',
      type: 'secret_mission',
      title: 'Протокол: Бегство',
      description: 'Подготовь путь к аварийному шлюзу',
      isRevealed: false,
    },
  ],
  logan: [
    characterCard('logan', true),
    {
      id: 'logan-skill',
      type: 'skill',
      title: 'Архивист',
      description: 'Находит записи в закрытых терминалах',
      isRevealed: true,
    },
    {
      id: 'logan-bio',
      type: 'biometrics',
      title: 'Тихий шаг',
      description: 'Почти не издаёт звуков при ходьбе',
      isRevealed: false,
    },
    {
      id: 'logan-inv',
      type: 'inventory',
      title: 'Журнал смен',
      description: 'Записи за последние две недели',
      isRevealed: true,
    },
    {
      id: 'logan-trait',
      type: 'trait',
      title: 'Хранительница',
      description: 'Помнит имена всех, кто был на станции',
      isRevealed: false,
    },
    {
      id: 'logan-mission',
      type: 'secret_mission',
      title: 'Протокол: Летописец',
      description: 'Зафиксируй три подозрительных события',
      isRevealed: false,
    },
  ],
  chester: [
    characterCard('chester', true),
    {
      id: 'chester-skill',
      type: 'skill',
      title: 'Лазание',
      description: 'Проходит там, где взрослые не пролезут',
      isRevealed: false,
    },
    {
      id: 'chester-bio',
      type: 'biometrics',
      title: 'Детский голос',
      description: 'Легко узнаваем в записи переговоров',
      isRevealed: true,
    },
    {
      id: 'chester-inv',
      type: 'inventory',
      title: 'Фонарик',
      description: 'Самодельный, мерцает на слабом заряде',
      isRevealed: false,
    },
    {
      id: 'chester-trait',
      type: 'trait',
      title: 'Смельчакка',
      description: 'Не боится лезть в закрытые секции',
      isRevealed: true,
    },
    {
      id: 'chester-mission',
      type: 'secret_mission',
      title: 'Протокол: Разведка',
      description: 'Найди спрятанный проход в секторе C',
      isRevealed: false,
    },
  ],
  roxy: [
    characterCard('roxy', true),
    {
      id: 'roxy-skill',
      type: 'skill',
      title: 'Хакерство',
      description: 'Взлом терминалов и обход замков',
      isRevealed: true,
    },
    {
      id: 'roxy-bio',
      type: 'biometrics',
      title: 'Кибер-рука',
      description: 'Протез с встроенным интерфейсом',
      isRevealed: false,
    },
    {
      id: 'roxy-inv',
      type: 'inventory',
      title: 'Портативный терминал',
      description: 'Старый, но читает локальные логи',
      isRevealed: false,
    },
    {
      id: 'roxy-trait',
      type: 'trait',
      title: 'Отшельница',
      description: 'Избегает общих собраний и разговоров',
      isRevealed: false,
    },
    {
      id: 'roxy-mission',
      type: 'secret_mission',
      title: 'Протокол: Симпатизант',
      description: 'Сделай так, чтобы Синтетик попал в Конвой',
      isRevealed: false,
    },
  ],
};

/** Карты другого игрока, уже раскрытые за столом (без секретных миссий) */
export function getRevealedCardsForPlayer(characterId: string): PlayerHandCard[] {
  const hand = MOCK_PLAYER_HANDS[characterId];
  if (!hand) return [];
  return hand.filter(
    (card) =>
      card.isRevealed && card.type !== 'secret_mission' && card.type !== 'character',
  );
}
