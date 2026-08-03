import type { GlobalChatLine, VoteBarPlayer } from '@/types/roundTablePhase';

const MOCK_REVEALED_ROXY: VoteBarPlayer['revealedCards'] = [
  { id: 'c1', isRevealed: true, label: 'Навык: Хакер' },
  { id: 'c2', isRevealed: false },
  { id: 'c3', isRevealed: false },
  { id: 'c4', isRevealed: false },
  { id: 'c5', isRevealed: false },
  { id: 'c6', isRevealed: false },
];

const MOCK_REVEALED_COLE: VoteBarPlayer['revealedCards'] = [
  { id: 'c1', isRevealed: true, label: 'Биометрия: Тремор' },
  { id: 'c2', isRevealed: true, label: 'Инвентарь: Ключ' },
  { id: 'c3', isRevealed: false },
  { id: 'c4', isRevealed: false },
  { id: 'c5', isRevealed: false },
  { id: 'c6', isRevealed: false },
];

export const MOCK_VOTE_BAR_PLAYERS: VoteBarPlayer[] = [
  {
    id: 'vance',
    name: 'Вэнс',
    portraitColor: 'linear-gradient(135deg, #1a3a2a 0%, #39ff14 100%)',
    statusKind: 'voting',
    statusLabel: 'VOTING',
    revealedCards: [
      { id: 'c1', isRevealed: true, label: 'Фактор: Старожил' },
      { id: 'c2', isRevealed: false },
      { id: 'c3', isRevealed: false },
      { id: 'c4', isRevealed: false },
      { id: 'c5', isRevealed: false },
      { id: 'c6', isRevealed: false },
    ],
  },
  {
    id: 'roxy',
    name: 'Рокси',
    portraitColor: 'linear-gradient(135deg, #3a1a2a 0%, #ff003c 100%)',
    statusKind: 'votes',
    statusLabel: '3 ГОЛОСА',
    revealedCards: MOCK_REVEALED_ROXY,
  },
  {
    id: 'cole',
    name: 'Коул',
    portraitColor: 'linear-gradient(135deg, #1a2a3a 0%, #4da6ff 100%)',
    statusKind: 'idle',
    statusLabel: 'READY',
    revealedCards: MOCK_REVEALED_COLE,
  },
  {
    id: 'martha',
    name: 'Марта',
    portraitColor: 'linear-gradient(135deg, #2a1a3a 0%, #a855f7 100%)',
    statusKind: 'voting',
    statusLabel: 'VOTING',
    revealedCards: MOCK_REVEALED_ROXY,
  },
  {
    id: 'penny',
    name: 'Пенни',
    portraitColor: 'linear-gradient(135deg, #3a2a1a 0%, #ffb020 100%)',
    statusKind: 'evicted',
    statusLabel: 'EVICTED',
  },
  {
    id: 'gwen',
    name: 'Гвен',
    portraitColor: 'linear-gradient(135deg, #1a3a3a 0%, #2dd4bf 100%)',
    statusKind: 'votes',
    statusLabel: '1 ГОЛОС',
    revealedCards: MOCK_REVEALED_ROXY,
  },
  {
    id: 'logan',
    name: 'Логан',
    portraitColor: 'linear-gradient(135deg, #2a2a1a 0%, #eab308 100%)',
    statusKind: 'idle',
    statusLabel: 'READY',
    revealedCards: MOCK_REVEALED_COLE,
  },
];

export const MOCK_GLOBAL_CHAT: GlobalChatLine[] = [
  {
    id: 'msg-1',
    sender: 'Вэнс',
    text: 'Кто-нибудь слышал шум из вентиляции в секторе C?',
    senderColor: '#39ff14',
  },
  {
    id: 'msg-2',
    sender: 'Рокси',
    text: 'Это не вентиляция. Терминал снова пишет чужие логи.',
    senderColor: '#ffb020',
  },
  {
    id: 'msg-3',
    sender: 'Коул',
    text: 'Предлагаю не трогать конвой до рассвета. Слишком много глаз.',
    senderColor: '#4da6ff',
  },
  {
    id: 'msg-reveal-1',
    type: 'system_reveal',
    sender: 'Система',
    text: '',
    playerName: 'Рокси',
    cardTitle: 'Навык: Хакерство',
  },
  {
    id: 'msg-4',
    sender: 'Марта',
    text: 'Я видела, как Пенни выходила из серверной. Без пропуска.',
    senderColor: '#a855f7',
  },
  {
    id: 'msg-reveal-2',
    type: 'system_reveal',
    sender: 'Система',
    text: '',
    playerName: 'Коул',
    cardTitle: 'Биометрия: Тремор рук',
  },
  {
    id: 'msg-5',
    sender: 'Гвен',
    text: 'Если это правда — голосую за изоляцию. Протокол не терпит дыр.',
    senderColor: '#2dd4bf',
  },
  {
    id: 'msg-6',
    sender: 'Логан',
    text: 'Зафиксировала: три аномалии биометрии за последний час.',
    senderColor: '#eab308',
  },
  {
    id: 'msg-7',
    sender: 'Система',
    text: '>>> ФАЗА ГОЛОСОВАНИЯ АКТИВНА. ВЫБЕРИТЕ КАНДИДАТА НА ИЗГНАНИЕ.',
    senderColor: '#737373',
  },
];

/** Начальное время раунда для мока (7 минут) */
export const MOCK_ROUND_SECONDS = 7 * 60;

/** Порог срочной фазы (20 секунд) */
export const URGENT_PHASE_SECONDS = 20;
