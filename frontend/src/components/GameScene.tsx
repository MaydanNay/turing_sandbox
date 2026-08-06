import { Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomHand } from '@/components/Hand';
import { BrigGrid } from '@/components/Brig/BrigGrid';
import { CharacterActionMenu } from '@/components/CharacterActionMenu';
import { ChatToastStack } from '@/components/Chat/ChatToastStack';
import { formatPhaseLabel } from '@/components/Hud/GameProcessPanel';
import { GameHud } from '@/components/Hud';
import { PrivateChatOverlay } from '@/components/PrivateChat';
import { RoundTable } from '@/components/RoundTable';
import { MOCK_PLAYER_HANDS } from '@/data/mockPlayerHands';
import { MOCK_HAND_CARDS } from '@/data/mockHand';
import { useGeneralChatEffects } from '@/hooks/useGeneralChatEffects';
import { cardRevealLabel } from '@/utils/cardLabel';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import { usePrivateChatStore } from '@/store/privateChatStore';
import { useGameStore } from '@/store/gameStore';
import type { PlayerHandCard } from '@/types/card';
import type { ChatMessage, GamePhase, MyProfile, Player, TypingIndicator } from '@/types/game';

interface GameSceneProps {
  gameState: GamePhase;
  players: Player[];
  gatheredAtTable: boolean;
  onGatherAtTable: () => void;
  chat: ChatMessage[];
  typing: TypingIndicator[];
  myProfile: MyProfile | null;
  connected: boolean;
  roomId: string | null;
  clientId: string | null;
  mockMode: boolean;
  selectedPlayerId: string | null;
  onSelectPlayer: (id: string) => void;
  onSendChat: (text: string) => void;
  onSendPrivate?: (agentId: string, partnerName: string, text: string) => void;
  onLeave?: () => void;
}

export function GameScene({
  gameState,
  players,
  gatheredAtTable,
  onGatherAtTable,
  chat,
  typing,
  myProfile,
  connected,
  roomId,
  clientId,
  mockMode,
  selectedPlayerId,
  onSelectPlayer,
  onSendChat,
  onSendPrivate,
  onLeave,
}: GameSceneProps) {
  const [handCards, setHandCards] = useState<PlayerHandCard[]>(MOCK_HAND_CARDS);
  const [isMyTurnToReveal, setIsMyTurnToReveal] = useState(false);
  const recordCardReveal = useGameStore((s) => s.recordCardReveal);
  const brigCharacterIds = useGameStore((s) => s.brigCharacterIds);
  const votes = useGameStore((s) => s.votes);
  const castVoteToBrig = useGameStore((s) => s.castVoteToBrig);
  const [privateChatPlayerId, setPrivateChatPlayerId] = useState<string | null>(null);
  const [actionMenuPlayerId, setActionMenuPlayerId] = useState<string | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<DOMRect | null>(null);
  const wasGatheredRef = useRef(false);
  const mockPrivatePingRef = useRef(false);

  useGeneralChatEffects({
    chat,
    myProfile,
    gatheredAtTable,
    gameState,
  });

  const privateChatPlayer =
    players.find((p) => p.id === privateChatPlayerId) ?? null;
  const actionMenuPlayer =
    players.find((p) => p.id === actionMenuPlayerId) ?? null;

  useEffect(() => {
    if (myProfile?.characterId && MOCK_PLAYER_HANDS[myProfile.characterId]) {
      setHandCards(MOCK_PLAYER_HANDS[myProfile.characterId]!);
    }
  }, [myProfile?.characterId]);

  useEffect(() => {
    if (gatheredAtTable && !wasGatheredRef.current) {
      wasGatheredRef.current = true;
      setIsMyTurnToReveal(true);
    }
    if (!gatheredAtTable) {
      wasGatheredRef.current = false;
      setIsMyTurnToReveal(false);
    }
  }, [gatheredAtTable]);

  const handleGatherAtTable = useCallback(() => {
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
    setPrivateChatPlayerId(null);
    usePrivateChatStore.getState().setActivePartner(null);
    onGatherAtTable();
    setIsMyTurnToReveal(true);
  }, [onGatherAtTable]);

  const selfPlayerId = clientId ?? myProfile?.id;

  const canOpenPrivateChat = useCallback(
    (playerId: string) => {
      if (playerId === selfPlayerId) return false;
      const target = players.find((p) => p.id === playerId);
      if (!target?.is_alive) return false;
      if (!gatheredAtTable) return true;
      return gameState === 'RECESS';
    },
    [gatheredAtTable, gameState, players, selfPlayerId],
  );

  /** Кулуары: всегда в лобби; за столом — только в фазе RECESS */
  const handleOpenPrivateChat = useCallback(
    (playerId: string) => {
      if (!canOpenPrivateChat(playerId)) return;
      setActionMenuPlayerId(null);
      setActionMenuAnchor(null);
      usePrivateChatStore.getState().setActivePartner(playerId);
      setPrivateChatPlayerId(playerId);
    },
    [canOpenPrivateChat],
  );

  const handleCharacterPress = useCallback(
    (playerId: string, anchor: DOMRect) => {
      if (!canOpenPrivateChat(playerId)) return;
      setActionMenuPlayerId(playerId);
      setActionMenuAnchor(anchor);
    },
    [canOpenPrivateChat],
  );

  const handleCloseActionMenu = useCallback(() => {
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
  }, []);

  const handleDeletePrivateChat = useCallback(() => {
    if (!actionMenuPlayerId) return;
    usePrivateChatStore.getState().clearThread(actionMenuPlayerId);
    useChatNotificationStore.setState((state) => ({
      items: state.items.filter((item) => item.playerId !== actionMenuPlayerId),
    }));
    if (privateChatPlayerId === actionMenuPlayerId) {
      setPrivateChatPlayerId(null);
      usePrivateChatStore.getState().setActivePartner(null);
    }
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
  }, [actionMenuPlayerId, privateChatPlayerId]);

  useEffect(() => {
    if (gatheredAtTable && gameState !== 'RECESS') {
      setActionMenuPlayerId(null);
      setActionMenuAnchor(null);
      setPrivateChatPlayerId(null);
      usePrivateChatStore.getState().setActivePartner(null);
    }
  }, [gatheredAtTable, gameState]);

  const privateChatAtSeats = gatheredAtTable && gameState === 'RECESS';

  useEffect(() => {
    if (!mockMode || mockPrivatePingRef.current) return;

    const selfId = clientId ?? myProfile?.id;
    const partner = players.find((p) => p.id !== selfId && p.is_alive);
    if (!partner) return;

    mockPrivatePingRef.current = true;
    const timer = window.setTimeout(() => {
      const store = usePrivateChatStore.getState();
      store.ensureThread(partner.id, partner.name);
      store.receiveMessage(
        partner.id,
        partner.name,
        'Есть минутка? Нужно кое-что обсудить в кулуарах.',
      );
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [mockMode, players, clientId, myProfile?.id]);

  const handleRevealCard = useCallback(
    (cardId: string) => {
      if (!isMyTurnToReveal) return;

      const card = handCards.find((c) => c.id === cardId);
      if (!card || card.isRevealed) return;

      const revealed = { ...card, isRevealed: true };
      setHandCards((prev) => prev.map((c) => (c.id === cardId ? revealed : c)));

      recordCardReveal(
        myProfile?.name ?? 'Вы',
        {
          type: revealed.type,
          title: revealed.title,
          description: revealed.description,
          imageUrl: revealed.imageUrl,
        },
        cardRevealLabel(revealed),
      );
      setIsMyTurnToReveal(false);
    },
    [handCards, isMyTurnToReveal, myProfile, recordCardReveal],
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-bunker-text">
      <ChatToastStack onOpenPrivateChat={handleOpenPrivateChat} />

      <RoundTable
        players={players}
        gatheredAtTable={gatheredAtTable}
        onGatherAtTable={handleGatherAtTable}
        selfId={clientId ?? myProfile?.id}
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={onSelectPlayer}
        onOpenPrivateChat={handleCharacterPress}
        privateChatAtSeats={privateChatAtSeats}
      />

      {gatheredAtTable && (
        <BrigGrid brigCharacterIds={brigCharacterIds} players={players} />
      )}

      <CharacterActionMenu
        open={actionMenuPlayer != null && actionMenuAnchor != null}
        playerName={actionMenuPlayer?.name ?? ''}
        anchor={actionMenuAnchor}
        onTalk={() => {
          if (actionMenuPlayer) handleOpenPrivateChat(actionMenuPlayer.id);
        }}
        onDelete={handleDeletePrivateChat}
        onCancel={handleCloseActionMenu}
      />

      <PrivateChatOverlay
        player={privateChatPlayer}
        myProfile={myProfile}
        onSendPrivate={onSendPrivate}
        onClose={() => {
          setPrivateChatPlayerId(null);
          usePrivateChatStore.getState().setActivePartner(null);
        }}
      />

      <div className="pointer-events-none absolute inset-0 z-[35] bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.08)_50%)] bg-[length:100%_4px] opacity-25" />

      <div className="absolute left-4 top-4 z-[36] flex flex-wrap items-center gap-2">
        {!gatheredAtTable && (
          <span className="rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md">
            Нажмите на персонажа — кулуары
          </span>
        )}
        {!gatheredAtTable && (
          <span className="rounded-full border border-bunker-amber/60 bg-black/45 px-3 py-1 font-mono text-[10px] text-bunker-amber backdrop-blur-md">
            Нажмите на стол — общий чат
          </span>
        )}
        {gatheredAtTable && gameState === 'RECESS' && (
          <span className="rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md">
            Нажмите на игрока — кулуары
          </span>
        )}
        <span className="rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bunker-neon backdrop-blur-md">
          {formatPhaseLabel(gameState)}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-bunker-border/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md">
          {connected ? (
            <Wifi className="h-3 w-3 text-bunker-neon" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? 'LIVE' : mockMode ? 'MOCK' : 'OFF'}
        </span>
        {roomId && (
          <span className="hidden rounded-full border border-bunker-border/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md sm:inline">
            {roomId.slice(0, 8)}
          </span>
        )}
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-full border border-bunker-danger/50 bg-black/45 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bunker-danger backdrop-blur-md transition hover:border-bunker-danger hover:bg-bunker-danger/15"
          >
            Покинуть станцию
          </button>
        )}
      </div>

      {!gatheredAtTable && (
        <BottomHand
          cards={handCards}
          revealMode={false}
          onRevealCard={handleRevealCard}
        />
      )}

      <GameHud
        visible={gatheredAtTable && gameState !== 'RECESS'}
        chat={chat}
        players={players}
        myProfile={myProfile}
        selfCharacterId={myProfile?.characterId}
        isMyTurnToReveal={isMyTurnToReveal}
        handCards={handCards}
        onRevealCard={handleRevealCard}
        gamePhase={gameState}
        gatheredAtTable={gatheredAtTable}
        typing={typing.map((t) => t.sender)}
        onSendMessage={onSendChat}
        onVoteToBrig={castVoteToBrig}
        votes={votes}
        clientId={clientId}
        mockMode={mockMode}
      />
    </div>
  );
}
