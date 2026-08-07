import { useCallback, useEffect, useRef, useState } from 'react';

import type { HudChatLine } from '@/data/mockHud';
import {
  getPhaseCountdownConfig,
  isInVoteWindow,
  isRevealPhase,
} from '@/data/gamePhaseConfig';
import type { PlayerHandCard } from '@/types/card';
import type { ChatMessage, GamePhase, MyProfile, Player } from '@/types/game';
import { usePhaseCountdown } from '@/hooks/usePhaseCountdown';
import { chatMessagesToHudLines, playersToSidebarSlots } from '@/utils/chatAdapter';

import { GameChatPanel } from './GameChatPanel';

interface GameHudProps {
  visible?: boolean;
  chat: ChatMessage[];
  players: Player[];
  myProfile?: MyProfile | null;
  selfCharacterId?: string;
  isMyTurnToReveal?: boolean;
  handCards?: PlayerHandCard[];
  onRevealCard?: (cardId: string) => void;
  gamePhase?: GamePhase;
  gatheredAtTable?: boolean;
  typing?: string[];
  onSendMessage?: (text: string) => void;
  onVoteToBrig?: (targetCharacterId: string) => void;
  votes?: Record<string, string>;
  clientId?: string | null;
  mockMode?: boolean;
  panelOpen?: boolean;
  onClosePanel?: () => void;
  onOpenPanel?: () => void;
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
  handCards = [],
  onRevealCard,
  gamePhase = 'PITCH',
  gatheredAtTable = true,
  typing = [],
  onSendMessage,
  onVoteToBrig,
  votes = {},
  clientId,
  mockMode = false,
  panelOpen = true,
  onClosePanel,
  onOpenPanel,
}: GameHudProps) {
  const [forceVoting, setForceVoting] = useState(false);

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

  const revealCharacterId =
    revealPlayer && isRevealPhase(gamePhase) ? revealPlayer.id : null;

  const { resetKey, initialSeconds } = getPhaseCountdownConfig(
    gamePhase,
    gatheredAtTable,
    revealCharacterId,
  );

  const remaining = usePhaseCountdown(initialSeconds, resetKey);

  const handleMockStartVoting = useCallback(() => {
    setForceVoting(true);
  }, []);

  const isMyRevealTurn = Boolean(
    isMyTurnToReveal ||
      (myProfile && pendingRevealId === myProfile.characterId),
  );

  const isVotingMode =
    forceVoting || gamePhase === 'VOTE' || isInVoteWindow(gamePhase, remaining);

  const forcePanelOpen = isMyRevealTurn || isVotingMode;
  const wasForceOpen = useRef(false);

  // Auto-open once when reveal/vote starts; allow user to close afterwards.
  useEffect(() => {
    if (forcePanelOpen && !wasForceOpen.current) {
      onOpenPanel?.();
    }
    wasForceOpen.current = forcePanelOpen;
  }, [forcePanelOpen, onOpenPanel]);

  if (!visible || !panelOpen) return null;

  const hudMessages: HudChatLine[] = chatMessagesToHudLines(chat, players, myProfile);

  const voterId = clientId ?? myProfile?.id;
  const hasVoted = Boolean(voterId && votes[voterId]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[24px]"
        aria-hidden
      />
      <GameChatPanel
        messages={hudMessages}
        players={sidebarPlayers}
        rosterPlayers={players}
        myProfile={myProfile}
        selfId={selfCharacterId}
        onSend={onSendMessage}
        inputDisabled={isMyRevealTurn}
        typing={typing}
        topOffsetClass="top-4"
        gamePhase={gamePhase}
        revealPlayer={revealPlayer}
        isMyRevealTurn={isMyRevealTurn}
        gatheredAtTable={gatheredAtTable}
        handCards={handCards}
        onRevealCard={onRevealCard}
        isVotingMode={isVotingMode}
        hasVoted={hasVoted}
        onVoteToBrig={onVoteToBrig}
        mockMode={mockMode}
        onMockStartVoting={handleMockStartVoting}
        forceVoting={forceVoting}
        onClose={onClosePanel}
      />
    </div>
  );
}
