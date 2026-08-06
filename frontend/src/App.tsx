import { useCallback, useEffect, useState } from 'react';

import { finishSession, fetchSession } from '@/api/sessions';
import { ChatToastStack } from '@/components/Chat/ChatToastStack';
import { GameScene } from '@/components/GameScene';
import { LobbyScreen } from '@/components/LobbyScreen';
import { SessionHistoryScreen } from '@/components/SessionHistoryScreen';
import { playChatSendSoundEffect } from '@/hooks/useGeneralChatEffects';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useChatNotificationStore } from '@/store/chatNotificationStore';
import { useGameStore } from '@/store/gameStore';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';
import { usePrivateChatStore } from '@/store/privateChatStore';
import {
  clearAllSessionPersistence,
  flushUiSnapshotSave,
  loadActiveSession,
  loadUiSnapshot,
  saveActiveSession,
  scheduleUiSnapshotSave,
  type PersistMode,
  type UiSnapshot,
} from '@/store/sessionPersistence';

type AppMode = 'lobby' | 'history' | 'live';

function pushMatchOutcomeToast(winningTeam: string | null | undefined): void {
  const team = (winningTeam ?? '').toUpperCase();
  if (team === 'HUMAN') {
    useChatNotificationStore.getState().push({
      kind: 'general',
      title: 'Итог матча',
      body: 'Люди победили — все синтетики в карцере.',
    });
    return;
  }
  if (team === 'SYNTHETICS') {
    useChatNotificationStore.getState().push({
      kind: 'general',
      title: 'Итог матча',
      body: 'Синтетики уцелели — не все инфильтраторы изолированы.',
    });
  }
}

function buildSnapshot(mode: PersistMode): UiSnapshot | null {
  const game = useGameStore.getState();
  const privateChat = usePrivateChatStore.getState();
  if (!game.roomId || !game.clientId) return null;
  if (mode !== 'live') return null;

  return {
    roomId: game.roomId,
    mode,
    clientId: game.clientId,
    gameState: game.gameState,
    gatheredAtTable: game.gatheredAtTable,
    seatedPlayerIds: game.seatedPlayerIds,
    meetingCallsUsed: game.meetingCallsUsed,
    lastMeetingCallAt: game.lastMeetingCallAt,
    brigCharacterIds: game.brigCharacterIds,
    votes: game.votes,
    sessionAges: game.sessionAges,
    players: game.players,
    chat: game.chat,
    myProfile: game.myProfile,
    myHand: game.myHand,
    revealedByPlayer: game.revealedByPlayer,
    privateThreads: privateChat.threads,
    privateUnread: privateChat.unread,
    privateSeeded: privateChat.seededPartners,
    outpostPositions: useOutpostMovementStore.getState().positions,
    updatedAt: Date.now(),
  };
}

function hydrateOutpostFromSnapshot(snap: UiSnapshot | null): void {
  if (!snap?.outpostPositions || Object.keys(snap.outpostPositions).length === 0) {
    useOutpostMovementStore.getState().sanitizeAllPositions();
    return;
  }
  useOutpostMovementStore.getState().hydratePositions(snap.outpostPositions);
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('lobby');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const { connect, disconnect, send } = useWebSocket();

  const gameState = useGameStore((s) => s.gameState);
  const players = useGameStore((s) => s.players);
  const chat = useGameStore((s) => s.chat);
  const typing = useGameStore((s) => s.typing);
  const myProfile = useGameStore((s) => s.myProfile);
  const connected = useGameStore((s) => s.connected);
  const roomId = useGameStore((s) => s.roomId);
  const clientId = useGameStore((s) => s.clientId);
  const error = useGameStore((s) => s.error);
  const gatheredAtTable = useGameStore((s) => s.gatheredAtTable);
  const seatedPlayerIds = useGameStore((s) => s.seatedPlayerIds);
  const meetingCallsUsed = useGameStore((s) => s.meetingCallsUsed);
  const gatherAtTable = useGameStore((s) => s.gatherAtTable);
  const leaveTable = useGameStore((s) => s.leaveTable);
  const sitSelf = useGameStore((s) => s.sitSelf);
  const standSelf = useGameStore((s) => s.standSelf);
  const prepareLiveSession = useGameStore((s) => s.prepareLiveSession);
  const applyUiSnapshot = useGameStore((s) => s.applyUiSnapshot);
  const brigCharacterIds = useGameStore((s) => s.brigCharacterIds);
  const votes = useGameStore((s) => s.votes);
  const privateThreads = usePrivateChatStore((s) => s.threads);
  const privateUnread = usePrivateChatStore((s) => s.unread);

  // Debounced UI snapshot while in a live match
  useEffect(() => {
    if (mode !== 'live') return;
    scheduleUiSnapshotSave(() => buildSnapshot('live'));
  }, [
    mode,
    gameState,
    gatheredAtTable,
    seatedPlayerIds,
    meetingCallsUsed,
    chat.length,
    players,
    brigCharacterIds,
    votes,
    privateThreads,
    privateUnread,
    roomId,
    clientId,
    myProfile,
  ]);

  useEffect(() => {
    if (mode !== 'live') return;
    flushUiSnapshotSave(() => buildSnapshot('live'));
  }, [mode, roomId, clientId]);

  useEffect(() => {
    if (mode !== 'live') return;
    const flush = () => flushUiSnapshotSave(() => buildSnapshot('live'));
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [mode]);

  const handleJoinLive = useCallback(
    (rid: string, cid: string) => {
      clearAllSessionPersistence();
      setLobbyError(null);
      prepareLiveSession(rid, cid);
      saveActiveSession({
        mode: 'live',
        roomId: rid,
        clientId: cid,
        updatedAt: Date.now(),
      });
      connect(rid, cid);
      setMode('live');
    },
    [connect, prepareLiveSession],
  );

  const resumeLiveSession = useCallback(async (): Promise<boolean> => {
    const active = loadActiveSession();
    if (!active || active.mode !== 'live') {
      if (active) clearAllSessionPersistence(active.roomId);
      setCanContinue(false);
      return false;
    }
    const snap = loadUiSnapshot(active.roomId);
    setLobbyError(null);

    try {
      const detail = await fetchSession(active.roomId);
      if (!detail.resumable) {
        clearAllSessionPersistence(active.roomId);
        setCanContinue(false);
        setLobbyError('Сессия больше недоступна. Начните New Game заново.');
        return false;
      }
    } catch {
      // Keep trying reconnect with stored pointer; WS may still work
    }

    useGameStore.setState({
      roomId: active.roomId,
      clientId: active.clientId,
      connected: false,
      chat: [],
      typing: [],
      error: null,
      sessionAges: snap?.sessionAges ?? useGameStore.getState().sessionAges,
      brigCharacterIds: snap?.brigCharacterIds ?? [],
      votes: snap?.votes ?? {},
      gatheredAtTable: snap?.gatheredAtTable ?? false,
      seatedPlayerIds: snap?.seatedPlayerIds ?? [],
    });
    hydrateOutpostFromSnapshot(snap);
    usePrivateChatStore.getState().reset();
    usePrivateChatStore.getState().setLiveMode(true);
    connect(active.roomId, active.clientId);
    setMode('live');
    setCanContinue(true);
    return true;
  }, [connect]);

  const handleContinue = useCallback(async () => {
    await resumeLiveSession();
  }, [resumeLiveSession]);

  // Boot: auto-resume on refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = loadActiveSession();
      if (!active || active.mode !== 'live') {
        if (active) clearAllSessionPersistence(active.roomId);
        if (!cancelled) {
          setCanContinue(false);
          setBootChecked(true);
        }
        return;
      }

      const ok = await resumeLiveSession();
      if (cancelled) return;
      if (!ok) setCanContinue(false);
      setBootChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'live' || !connected || !roomId) return;
    const snap = loadUiSnapshot(roomId);
    if (snap) applyUiSnapshot(snap, { restoreGathered: true });
  }, [mode, connected, roomId, applyUiSnapshot]);

  // Persist standing positions as they change
  useEffect(() => {
    if (mode !== 'live') return;
    return useOutpostMovementStore.subscribe(() => {
      scheduleUiSnapshotSave(() => buildSnapshot('live'));
    });
  }, [mode]);

  const handleLeave = useCallback(async () => {
    const game = useGameStore.getState();
    const rid = game.roomId;

    flushUiSnapshotSave(() => buildSnapshot('live'));

    if (mode === 'live' && rid) {
      try {
        const isResolve = game.gameState === 'RESOLVE';
        const result = await finishSession(rid, {
          winningTeam: isResolve ? 'DRAW' : 'ABORTED',
          brigAgents: game.brigCharacterIds,
        });
        pushMatchOutcomeToast(result.winning_team);
      } catch {
        // Still leave locally even if finish fails (room may already be gone)
      }
      disconnect();
    }

    clearAllSessionPersistence(rid);
    useGameStore.getState().reset();
    useOutpostMovementStore.getState().reset();
    usePrivateChatStore.getState().reset();
    setSelectedPlayerId(null);
    setCanContinue(false);
    setLobbyError(null);
    setMode('lobby');
  }, [mode, disconnect]);

  const handleSendChat = useCallback(
    (text: string) => {
      playChatSendSoundEffect();
      send({ action: 'chat', text });
    },
    [send],
  );

  const handleSendPrivate = useCallback(
    (agentId: string, partnerName: string, text: string) => {
      usePrivateChatStore.getState().sendMessage(agentId, partnerName, text);
      send({
        action: 'private_chat_send',
        type: 'private_chat_send',
        text,
        agent_id: agentId,
        payload: { agent_id: agentId },
      });
    },
    [send],
  );

  const handleRevealCard = useCallback(
    (cardId: string) => {
      send({
        action: 'reveal_card',
        type: 'reveal_card',
        card_id: cardId,
        payload: { card_id: cardId },
      });
    },
    [send],
  );

  if (mode === 'history') {
    return (
      <>
        <ChatToastStack />
        <SessionHistoryScreen onBack={() => setMode('lobby')} />
      </>
    );
  }

  if (mode === 'lobby') {
    if (!bootChecked) {
      return <div className="min-h-screen bg-black" aria-busy aria-label="Загрузка сессии" />;
    }
    return (
      <>
        <ChatToastStack />
        <LobbyScreen
          onJoinLive={handleJoinLive}
          onContinue={() => {
            void handleContinue();
          }}
          onOpenHistory={() => setMode('history')}
          canContinue={canContinue}
          error={lobbyError ?? error}
        />
      </>
    );
  }

  return (
    <GameScene
      gameState={gameState}
      players={players}
      gatheredAtTable={gatheredAtTable}
      seatedPlayerIds={seatedPlayerIds}
      onSitSelf={sitSelf}
      onStandSelf={standSelf}
      onGatherAtTable={gatherAtTable}
      onLeaveTable={leaveTable}
      chat={chat}
      typing={typing}
      myProfile={myProfile}
      connected={connected}
      roomId={roomId}
      clientId={clientId}
      mockMode={false}
      selectedPlayerId={selectedPlayerId}
      onSelectPlayer={setSelectedPlayerId}
      onSendChat={handleSendChat}
      onSendPrivate={handleSendPrivate}
      onRevealCard={handleRevealCard}
      onLeave={handleLeave}
    />
  );
}
