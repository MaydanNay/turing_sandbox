export type PlayerHudStatus = 'alive' | 'dead' | 'suspicious';

export interface HudPlayerSlot {
  id: string;
  name: string;
  avatarColor: string;
  status: PlayerHudStatus;
  statusLabel: string;
  isActive?: boolean;
}

export interface HudChatLine {
  id: string;
  sender: string;
  text: string;
  senderColor?: string;
}

export const MOCK_HUD_PLAYERS: HudPlayerSlot[] = [
  {
    id: 'vance',
    name: 'Vance',
    avatarColor: 'linear-gradient(135deg,#1a3a2a,#39ff14)',
    status: 'alive',
    statusLabel: 'VOTING',
  },
  {
    id: 'cole',
    name: 'Cole',
    avatarColor: 'linear-gradient(135deg,#1a2a3a,#4da6ff)',
    status: 'alive',
    statusLabel: '0 VOTING',
  },
  {
    id: 'martha',
    name: 'Martha',
    avatarColor: 'linear-gradient(135deg,#2a1a3a,#a855f7)',
    status: 'suspicious',
    statusLabel: 'VOTING',
  },
  {
    id: 'penny',
    name: 'Penny',
    avatarColor: 'linear-gradient(135deg,#3a2a1a,#ffb020)',
    status: 'dead',
    statusLabel: '-',
  },
  {
    id: 'gwen',
    name: 'Gwen',
    avatarColor: 'linear-gradient(135deg,#1a3a3a,#2dd4bf)',
    status: 'alive',
    statusLabel: 'VOTING',
    isActive: true,
  },
  {
    id: 'logan',
    name: 'Logan',
    avatarColor: 'linear-gradient(135deg,#2a2a1a,#eab308)',
    status: 'alive',
    statusLabel: '-',
  },
  {
    id: 'chester',
    name: 'Chester',
    avatarColor: 'linear-gradient(135deg,#2a1a1a,#f87171)',
    status: 'alive',
    statusLabel: '0 VOTING',
  },
  {
    id: 'roxy',
    name: 'Roxy',
    avatarColor: 'linear-gradient(135deg,#3a1a2a,#ff003c)',
    status: 'alive',
    statusLabel: 'VOTING',
  },
];

export const MOCK_HUD_CHAT: HudChatLine[] = [
  { id: '1', sender: 'Vance', text: 'Кто-нибудь слышал шум из вентиляции?' },
  { id: '2', sender: 'Roxy', text: 'Терминал снова пишет чужие логи.' },
  { id: '3', sender: 'Cole', text: 'Не трогаем конвой до рассвета.' },
  { id: '4', sender: 'Martha', text: 'Пенни выходила из серверной без пропуска.' },
  { id: '5', sender: 'Gwen', text: 'Голосую за изоляцию — протокол не терпит дыр.' },
  { id: '6', sender: 'Logan', text: 'Три аномалии биометрии за последний час.' },
  { id: '7', sender: 'Chester', text: 'Я видел, как кто-то двигал камеры.' },
  { id: '8', sender: 'System', text: '>>> ФАЗА ГОЛОСОВАНИЯ АКТИВНА.', senderColor: '#a3a3a3' },
];
