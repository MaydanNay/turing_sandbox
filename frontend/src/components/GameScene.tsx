import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomHand } from '@/components/Hand';
import { BrigGrid } from '@/components/Brig/BrigGrid';
import { BrigHoldScreen } from '@/components/Brig/BrigHoldScreen';
import { CharacterActionMenu } from '@/components/CharacterActionMenu';
import { ChatToastStack } from '@/components/Chat/ChatToastStack';
import { EpilogueOverlay } from '@/components/EpilogueOverlay';
import { GameHud } from '@/components/Hud';
import { GameTopMenu } from '@/components/GameTopMenu';
import { MatchmakingOverlay } from '@/components/MatchmakingOverlay';
import { MeetingAnnouncement } from '@/components/MeetingAnnouncement';
import { PrivateChatOverlay } from '@/components/PrivateChat';
import { RoundTable } from '@/components/RoundTable';
import { SceneCoverFrame } from '@/components/SceneCoverFrame';
import { StationMissionHost } from '@/components/StationMission/StationMissionHost';
import { TableMeetingModal } from '@/components/TableMeetingModal';
import { useGeneralChatEffects } from '@/hooks/useGeneralChatEffects';
import { cardRevealLabel } from '@/utils/cardLabel';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { usePrivateChatStore } from '@/store/privateChatStore';
import { useGameStore } from '@/store/gameStore';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';
import type { ChatMessage, GamePhase, MyProfile, Player, TypingIndicator } from '@/types/game';

interface GameSceneProps {
  gameState: GamePhase;
  players: Player[];
  gatheredAtTable: boolean;
  seatedPlayerIds: string[];
  onSitSelf: (playerId: string) => void;
  onStandSelf: (playerId: string) => void;
  onGatherAtTable: () => void;
  onLeaveTable?: () => void;
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
  onRevealCard?: (cardId: string) => void;
  onLeave?: () => void;
}

export function GameScene({
  gameState,
  players,
  gatheredAtTable,
  seatedPlayerIds,
  onSitSelf,
  onStandSelf,
  onGatherAtTable,
  onLeaveTable,
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
  onRevealCard,
  onLeave,
}: GameSceneProps) {
  const handCards = useGameStore((s) => s.myHand);
  const revealMyCard = useGameStore((s) => s.revealMyCard);
  const recordCardReveal = useGameStore((s) => s.recordCardReveal);
  const castVoteToBrig = useGameStore((s) => s.castVoteToBrig);
  const revealTurnClientId = useGameStore((s) => s.revealTurnClientId);
  const voteOpen = useGameStore((s) => s.voteOpen);
  const [mockRevealTurn, setMockRevealTurn] = useState(false);
  const brigCharacterIds = useGameStore((s) => s.brigCharacterIds);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const epilogueReport = useGameStore((s) => s.epilogueReport);
  const phaseDeadlineTs = useGameStore((s) => s.phaseDeadlineTs);
  const rolesAssigned = useGameStore((s) => s.rolesAssigned);
  const votes = useGameStore((s) => s.votes);
  const meetingCallsUsed = useGameStore((s) => s.meetingCallsUsed);
  const lastMeetingCallAt = useGameStore((s) => s.lastMeetingCallAt);
  const [privateChatPlayerId, setPrivateChatPlayerId] = useState<string | null>(null);
  const [actionMenuPlayerId, setActionMenuPlayerId] = useState<string | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<DOMRect | null>(null);
  const [generalChatOpen, setGeneralChatOpen] = useState(true);
  const [meetingAnnounce, setMeetingAnnounce] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const wasGatheredRef = useRef(false);
  const mockPrivatePingRef = useRef(false);

  const selfClientId = clientId ?? myProfile?.id ?? null;
  const isMyTurnToReveal = mockMode
    ? mockRevealTurn
    : Boolean(
        !voteOpen &&
          revealTurnClientId &&
          selfClientId &&
          revealTurnClientId === selfClientId,
      );
  const openGeneralChat = useCallback(() => {
    setGeneralChatOpen(true);
  }, []);

  const closeGeneralChat = useCallback(() => {
    setGeneralChatOpen(false);
  }, []);

  useGeneralChatEffects({
    chat,
    myProfile,
    gatheredAtTable,
    gameState,
    generalChatOpen,
  });

  const privateChatPlayer =
    players.find((p) => p.id === privateChatPlayerId) ?? null;
  const actionMenuPlayer =
    players.find((p) => p.id === actionMenuPlayerId) ?? null;

  useEffect(() => {
    if (gatheredAtTable && !wasGatheredRef.current) {
      wasGatheredRef.current = true;
      if (mockMode) setMockRevealTurn(true);
    }
    if (!gatheredAtTable) {
      wasGatheredRef.current = false;
      if (mockMode) setMockRevealTurn(false);
      setGeneralChatOpen(true);
    }
  }, [gatheredAtTable, mockMode]);

  useEffect(() => {
    if (gameState === 'RECESS') {
      setGeneralChatOpen(true);
    }
  }, [gameState]);

  const handleGatherAtTable = useCallback(() => {
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
    setPrivateChatPlayerId(null);
    usePrivateChatStore.getState().setActivePartner(null);
    onGatherAtTable();
    if (mockMode) setMockRevealTurn(true);
  }, [onGatherAtTable, mockMode]);

  const handleCallMeeting = useCallback(() => {
    if (gatheredAtTable || meetingAnnounce) return;
    const ok = useGameStore.getState().tryCallMeeting();
    if (!ok) return;
    setTableMenuOpen(false);
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
    setPrivateChatPlayerId(null);
    usePrivateChatStore.getState().setActivePartner(null);
    setMeetingAnnounce(true);
  }, [gatheredAtTable, meetingAnnounce]);

  const handleMeetingAnnounceDone = useCallback(() => {
    setMeetingAnnounce(false);
    handleGatherAtTable();
  }, [handleGatherAtTable]);

  const handleOpenTableMenu = useCallback(() => {
    if (gatheredAtTable || meetingAnnounce) return;
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
    setTableMenuOpen(true);
  }, [gatheredAtTable, meetingAnnounce]);

  const handleCloseTableMenu = useCallback(() => {
    setTableMenuOpen(false);
  }, []);

  const handleLeaveTable = useCallback(() => {
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
    setPrivateChatPlayerId(null);
    usePrivateChatStore.getState().setActivePartner(null);
    onLeaveTable?.();
  }, [onLeaveTable]);

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

      if (!gatheredAtTable && myProfile && !seatedPlayerIds.includes(myProfile.id)) {
        const targetFeet = useOutpostMovementStore.getState().getFeet(playerId);
        if (targetFeet) {
          useOutpostMovementStore.getState().setTarget(
            myProfile.id,
            targetFeet.x,
            targetFeet.y,
          );
        }
      }
    },
    [canOpenPrivateChat, gatheredAtTable, myProfile, seatedPlayerIds],
  );

  const handleCloseActionMenu = useCallback(() => {
    setActionMenuPlayerId(null);
    setActionMenuAnchor(null);
  }, []);

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

      // Live: server is authority — only send; hand/turn update arrives via WS.
      if (!mockMode) {
        onRevealCard?.(cardId);
        return;
      }

      const revealed = revealMyCard(cardId);
      if (!revealed) return;

      onRevealCard?.(cardId);

      if (revealed.type !== 'secret_mission') {
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
      }
      setMockRevealTurn(false);
    },
    [
      isMyTurnToReveal,
      mockMode,
      myProfile,
      onRevealCard,
      recordCardReveal,
      revealMyCard,
    ],
  );

  const { send } = useWebSocket();

  const handleVoteToBrig = useCallback(
    (targetCharacterId: string) => {
      if (mockMode) {
        castVoteToBrig(targetCharacterId);
        return;
      }
      const voterId = clientId ?? myProfile?.id;
      if (voterId) {
        // Optimistic: lock the button until server confirms / rejects
        useGameStore.setState((s) => ({
          votes: { ...s.votes, [voterId]: targetCharacterId },
        }));
      }
      send({
        action: 'vote',
        payload: { target_character_id: targetCharacterId },
      });
    },
    [mockMode, castVoteToBrig, send, clientId, myProfile?.id],
  );

  const selfCharacterId = myProfile?.characterId ?? null;
  const selfPlayer =
    players.find((p) => p.id === (clientId ?? myProfile?.id)) ??
    players.find((p) => p.characterId === selfCharacterId);
  const selfAlive = selfPlayer?.is_alive !== false;
  const selfInBrig = Boolean(
    selfCharacterId && brigCharacterIds.includes(selfCharacterId),
  );
  const epiloguePhase = gameState === 'RESOLVE' || matchEnded;
  const onConvoy = epiloguePhase && selfAlive && !selfInBrig;
  const searching = gameState === 'INIT' && !rolesAssigned && !matchEnded;

  const brigOutcomeLine = (() => {
    if (!epilogueReport) return null;
    const x = epilogueReport.synthetics_in_convoy;
    const synthWord =
      x === 1 ? 'Синтетик' : x >= 2 && x <= 4 ? 'Синтетика' : 'Синтетиков';
    const won = (epilogueReport.winning_team ?? '').toUpperCase() === 'HUMAN';
    return won
      ? `Итог: победа людей. В Конвой проникло ${x} ${synthWord}.`
      : `Итог: проигрыш — хотя бы 1 Синтетик на борту (${x} ${synthWord}).`;
  })();

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-bunker-text">
      <ChatToastStack
        onOpenPrivateChat={handleOpenPrivateChat}
        onOpenGeneralChat={openGeneralChat}
      />
      <StationMissionHost />

      <SceneCoverFrame>
        <RoundTable
          players={players}
          gatheredAtTable={gatheredAtTable}
          seatedPlayerIds={seatedPlayerIds}
          onSitSelf={onSitSelf}
          onStandSelf={onStandSelf}
          onLeaveTable={onLeaveTable ? handleLeaveTable : undefined}
          onOpenTableMenu={handleOpenTableMenu}
          selfId={clientId ?? myProfile?.id}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={onSelectPlayer}
          onOpenPrivateChat={handleCharacterPress}
          privateChatAtSeats={privateChatAtSeats}
        />
      </SceneCoverFrame>

      <TableMeetingModal
        open={tableMenuOpen}
        meetingCallsUsed={meetingCallsUsed}
        lastMeetingCallAt={lastMeetingCallAt}
        onCallMeeting={handleCallMeeting}
        onCancel={handleCloseTableMenu}
      />

      <MeetingAnnouncement
        open={meetingAnnounce}
        callerName={myProfile?.name ?? 'Вы'}
        onDone={handleMeetingAnnounceDone}
      />

      {!(generalChatOpen || privateChatPlayerId) && (
        <BrigGrid brigCharacterIds={brigCharacterIds} players={players} />
      )}

      <CharacterActionMenu
        open={actionMenuPlayer != null && actionMenuAnchor != null}
        playerName={actionMenuPlayer?.name ?? ''}
        anchor={actionMenuAnchor}
        onTalk={() => {
          if (actionMenuPlayer) handleOpenPrivateChat(actionMenuPlayer.id);
        }}
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

      <div className="pointer-events-auto absolute left-4 top-4 z-[36] flex flex-wrap items-start gap-2">
        <GameTopMenu
          gameState={gameState}
          connected={connected}
          mockMode={mockMode}
          roomId={roomId}
          onLeave={
            gameState === 'RESOLVE' && !matchEnded ? undefined : onLeave
          }
        />
        {gatheredAtTable && gameState === 'RECESS' && !privateChatPlayerId && (
          <span className="rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md">
            Нажмите на игрока — кулуары
          </span>
        )}
      </div>

      {!gatheredAtTable && (
        <BottomHand
          cards={handCards}
          revealMode={false}
          onRevealCard={handleRevealCard}
        />
      )}

      {gatheredAtTable && gameState !== 'RECESS' && !generalChatOpen && (
        <button
          type="button"
          onClick={openGeneralChat}
          className="pointer-events-auto absolute bottom-6 right-6 z-[36] rounded-md border-2 border-amber-300/50 bg-black/70 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-200 backdrop-blur-md transition hover:border-amber-300/80 hover:bg-amber-500/15"
        >
          Общий чат
        </button>
      )}

      <GameHud
        visible={
          (gatheredAtTable && gameState !== 'RECESS') ||
          (gameState === 'RESOLVE' && !matchEnded && !selfInBrig)
        }
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
        onVoteToBrig={handleVoteToBrig}
        votes={votes}
        clientId={clientId}
        mockMode={mockMode}
        panelOpen={generalChatOpen}
        onClosePanel={closeGeneralChat}
        onOpenPanel={openGeneralChat}
      />

      {/* Поиск игроков до старта матча */}
      {searching && <MatchmakingOverlay onLeave={onLeave} />}

      {/* Карцер: чёрный экран сразу после изоляции (не только эпилог) */}
      {selfInBrig && (
        <BrigHoldScreen
          waitingForConvoy={!matchEnded}
          phaseDeadlineTs={epiloguePhase ? phaseDeadlineTs : null}
          outcomeLine={brigOutcomeLine}
          onLeave={matchEnded ? onLeave : undefined}
        />
      )}

      {/* Конвой: живые не из карцера; посадка = баннер, аудит = фуллскрин */}
      {onConvoy && (
        <EpilogueOverlay
          boarding={!matchEnded}
          phaseDeadlineTs={phaseDeadlineTs}
          brigFilled={brigCharacterIds.length}
          report={epilogueReport}
          onLeave={matchEnded ? onLeave : undefined}
        />
      )}
    </div>
  );
}
