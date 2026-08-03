export type PlayerHudStatus = 'alive' | 'dead' | 'suspicious';

export interface HudPlayerSlot {
  id: string;
  name: string;
  avatarColor: string;
  status: PlayerHudStatus;
  statusLabel: string;
  isActive?: boolean;
}

import type { CardType } from '@/types/card';

export interface HudChatLine {
  id: string;
  sender: string;
  text: string;
  senderColor?: string;
  kind?: 'message' | 'system' | 'turn' | 'reveal';
  timestamp?: string;
  subtitle?: string;
  cardTitle?: string;
  cardType?: CardType;
  cardDescription?: string;
  cardImageUrl?: string;
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
    isActive: true,
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
  {
    id: '1',
    sender: 'Penny',
    text: 'Это не я ребт, вообще то я думаю что...',
    timestamp: '12:00',
    kind: 'message',
  },
  {
    id: '2',
    sender: 'Chester',
    text: 'Это не я ребт, вообще то я думаю что...',
    timestamp: '12:00',
    kind: 'message',
  },
  {
    id: '3',
    sender: 'System',
    text: 'Время Chester раскрывать карту',
    kind: 'turn',
    senderColor: '#2dd4bf',
  },
  {
    id: '4',
    sender: 'Chester',
    text: 'Chester раскрыл свой навык',
    subtitle: 'Оказывается он хакер',
    cardTitle: 'здесь будет карта',
    kind: 'reveal',
  },
];
