import type { HudChatLine, HudPlayerSlot, PlayerHudStatus } from '@/data/mockHud';
import type { ChatMessage, MyProfile, Player } from '@/types/game';

function formatChatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function resolveSenderName(
  sender: string,
  players: Player[],
  myProfile?: MyProfile | null,
): string {
  if (myProfile && (sender === myProfile.id || sender === myProfile.name)) {
    return myProfile.name;
  }

  const byId = players.find((p) => p.id === sender);
  if (byId) return byId.name;

  const byName = players.find((p) => p.name.toLowerCase() === sender.toLowerCase());
  if (byName) return byName.name;

  return sender;
}

export function resolveSenderCharacterId(
  sender: string,
  players: Player[],
  myProfile?: MyProfile | null,
): string | null {
  if (myProfile && (sender === myProfile.name || sender === myProfile.id || sender === 'Вы')) {
    return myProfile.characterId;
  }

  const byName = players.find((p) => p.name.toLowerCase() === sender.toLowerCase());
  if (byName) return byName.characterId;

  const byId = players.find((p) => p.id === sender);
  if (byId) return byId.characterId;

  const lowered = sender.toLowerCase();
  if (/^[a-z]+$/.test(lowered)) return lowered;

  return null;
}

export function chatMessageToHudLine(
  msg: ChatMessage,
  players: Player[],
  myProfile?: MyProfile | null,
): HudChatLine {
  if (msg.kind === 'reveal') {
    return {
      id: msg.id,
      sender: resolveSenderName(msg.sender, players, myProfile),
      text: msg.text,
      subtitle: msg.subtitle,
      cardTitle: msg.cardTitle,
      cardType: msg.cardType,
      cardDescription: msg.cardDescription,
      cardImageUrl: msg.cardImageUrl,
      kind: 'reveal',
      timestamp: formatChatTime(msg.timestamp),
    };
  }

  if (msg.kind === 'turn') {
    return {
      id: msg.id,
      sender: 'System',
      text: msg.text,
      kind: 'turn',
      senderColor: msg.senderColor ?? '#2dd4bf',
      timestamp: formatChatTime(msg.timestamp),
    };
  }

  const displaySender = resolveSenderName(msg.sender, players, myProfile);
  const timestamp = formatChatTime(msg.timestamp);
  const trimmed = msg.text.trim();
  const isSystem =
    msg.kind === 'system' ||
    displaySender === 'Система' ||
    msg.sender === 'Система' ||
    trimmed.startsWith('>>>') ||
    trimmed.startsWith('[MOCK]');

  if (isSystem) {
    const cleaned = trimmed.replace(/^>>>\s*/, '').replace(/^\[MOCK\]\s*/, '');
    const isTurn =
      cleaned.toLowerCase().includes('раскрыв') ||
      cleaned.toLowerCase().includes('фаза') ||
      cleaned.toLowerCase().includes('очередь');

    return {
      id: msg.id,
      sender: 'System',
      text: cleaned,
      kind: isTurn ? 'turn' : 'system',
      senderColor: msg.senderColor ?? '#2dd4bf',
      timestamp,
    };
  }

  return {
    id: msg.id,
    sender: displaySender,
    text: trimmed.replace(/^\[PITCH\]\s*/, ''),
    kind: 'message',
    timestamp,
  };
}

export function chatMessagesToHudLines(
  messages: ChatMessage[],
  players: Player[],
  myProfile?: MyProfile | null,
): HudChatLine[] {
  return messages.map((msg) => chatMessageToHudLine(msg, players, myProfile));
}

function playerStatus(player: Player): PlayerHudStatus {
  if (!player.is_alive) return 'dead';
  if (player.suspicion_score >= 50) return 'suspicious';
  return 'alive';
}

export function playersToSidebarSlots(
  players: Player[],
  activeCharacterId?: string | null,
): HudPlayerSlot[] {
  return players.map((player) => ({
    id: player.characterId,
    name: player.name,
    avatarColor: 'linear-gradient(135deg,#2a2a2a,#555)',
    status: playerStatus(player),
    statusLabel: player.is_alive ? (player.connected === false ? 'OFF' : 'ONLINE') : '-',
    isActive: activeCharacterId === player.characterId,
  }));
}
