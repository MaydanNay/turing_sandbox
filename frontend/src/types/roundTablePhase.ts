export type VoteBarStatusKind = 'voting' | 'evicted' | 'votes' | 'idle';

export type GlobalChatMessageType = 'default' | 'system_reveal';

export interface VoteBarPlayer {
  id: string;
  name: string;
  /** CSS-цвет или gradient для заглушки портрета */
  portraitColor: string;
  statusKind: VoteBarStatusKind;
  statusLabel: string;
  /** Публично раскрытые карты (для popover) */
  revealedCards?: PublicCardSlot[];
}

export interface PublicCardSlot {
  id: string;
  isRevealed: boolean;
  label?: string;
}

export interface GlobalChatLine {
  id: string;
  type?: GlobalChatMessageType;
  sender: string;
  text: string;
  senderColor?: string;
  /** Для type === 'system_reveal' */
  playerName?: string;
  cardTitle?: string;
}
