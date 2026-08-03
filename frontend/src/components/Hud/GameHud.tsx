import type { HudChatLine } from '@/data/mockHud';
import type { ChatMessage, GamePhase, MyProfile, Player } from '@/types/game';
import { chatMessagesToHudLines, playersToSidebarSlots } from '@/utils/chatAdapter';

import { GameChatPanel } from './GameChatPanel';

interface GameHudProps {
  visible?: boolean;
  chat: ChatMessage[];
  players: Player[];
  myProfile?: MyProfile | null;
  selfCharacterId?: string;
  isMyTurnToReveal?: boolean;
  gamePhase?: GamePhase;
  gatheredAtTable?: boolean;
  typing?: string[];
  onSendMessage?: (text: string) => void;
}

function pendingRevealCharacterId(
  chat: ChatMessage[],
  players: Player[],
): string | null {
  const lastTurnIdx = [...chat].reverse().findIndex((m) => m.kind === 'turn');
  if (lastTurnIdx === -1) return null;

  const turnIndex = chat.length - 1 - lastTurnIdx;
  const hasRevealAfter = chat.slice(turnIndex + 1).some((m) => m.kind === 'reveal');
  if (hasRevealAfter) return null;

  const lastTurn = chat[turnIndex];
  if (!lastTurn) return null;

  const match = lastTurn.text.match(/Время\s+(.+?)\s+раскрывать/i);
  const name = match?.[1]?.trim();
  const player = players.find((p) => p.name.toLowerCase() === name?.toLowerCase());
  return player?.characterId ?? null;
}

function activeCharacterFromChat(
  chat: ChatMessage[],
  players: Player[],
  isMyTurnToReveal: boolean,
  myProfile?: MyProfile | null,
): string | null {
  if (isMyTurnToReveal && myProfile) return myProfile.characterId;

  const lastTurn = [...chat].reverse().find((m) => m.kind === 'turn');
  if (lastTurn) {
    const match = lastTurn.text.match(/Время\s+(.+?)\s+раскрывать/i);
    const name = match?.[1]?.trim();
    const player = players.find((p) => p.name.toLowerCase() === name?.toLowerCase());
    if (player) return player.characterId;
  }

  const lastReveal = [...chat].reverse().find((m) => m.kind === 'reveal');
  if (lastReveal) {
    const player = players.find(
      (p) => p.name.toLowerCase() === lastReveal.sender.toLowerCase(),
    );
    if (player) return player.characterId;
  }

  return null;
}

export function GameHud({
  visible = true,
  chat,
  players,
  myProfile,
  selfCharacterId,
  isMyTurnToReveal = false,
  gamePhase = 'PITCH',
  gatheredAtTable = true,
  typing = [],
  onSendMessage,
}: GameHudProps) {
  if (!visible) return null;

  const hudMessages: HudChatLine[] = chatMessagesToHudLines(chat, players, myProfile);

  const pendingRevealId =
    (isMyTurnToReveal && myProfile?.characterId) ||
    pendingRevealCharacterId(chat, players);

  const activeCharacterId = pendingRevealId ?? activeCharacterFromChat(
    chat,
    players,
    false,
    myProfile,
  );

  const sidebarPlayers = playersToSidebarSlots(players, activeCharacterId);
  const revealPlayer = pendingRevealId
    ? sidebarPlayers.find((p) => p.id === pendingRevealId) ?? null
    : null;

  const isMyRevealTurn = Boolean(
    isMyTurnToReveal ||
      (myProfile && pendingRevealId === myProfile.characterId),
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <GameChatPanel
        messages={hudMessages}
        players={sidebarPlayers}
        rosterPlayers={players}
        myProfile={myProfile}
        selfId={selfCharacterId}
        onSend={onSendMessage}
        inputDisabled={isMyTurnToReveal}
        typing={typing}
        topOffsetClass="top-12 sm:top-14"
        gamePhase={gamePhase}
        revealPlayer={revealPlayer}
        isMyRevealTurn={isMyRevealTurn}
        gatheredAtTable={gatheredAtTable}
      />
    </div>
  );
}
