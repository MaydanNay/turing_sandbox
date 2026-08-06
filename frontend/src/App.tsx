import { useCallback, useEffect, useState } from 'react';

import { finishSession, fetchSession } from '@/api/sessions';
import { GameScene } from '@/components/GameScene';
import { LobbyScreen } from '@/components/LobbyScreen';
import { SessionHistoryScreen } from '@/components/SessionHistoryScreen';
import { playChatSendSoundEffect } from '@/hooks/useGeneralChatEffects';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useGameStore } from '@/store/gameStore';
import { usePrivateChatStore } from '@/store/privateChatStore';
import {
  clearAllSessionPersistence,
  flushUiSnapshotSave,
  loadActiveSession,
  loadUiSnapshot,
  scheduleUiSnapshotSave,
  type PersistMode,
  type UiSnapshot,
} from '@/store/sessionPersistence';

type AppMode = 'lobby' | 'history' | 'mock' | 'live';

function buildSnapshot(mode: PersistMode): UiSnapshot | null {
  const game = useGameStore.getState();
  const privateChat = usePrivateChatStore.getState();
  if (!game.roomId || !game.clientId) return null;
  if (mode !== 'mock' && mode !== 'live') return null;

  return {
    roomId: game.roomId,
    mode,
    clientId: game.clientId,
    gameState: game.gameState,
    gatheredAtTable: game.gatheredAtTable,
    brigCharacterIds: game.brigCharacterIds,
    votes: game.votes,
    sessionAges: game.sessionAges,
    players: game.players,
    chat: game.chat,
    myProfile: game.myProfile,
    privateThreads: privateChat.threads,
    privateUnread: privateChat.unread,
    privateSeeded: privateChat.seededPartners,
    updatedAt: Date.now(),
  };
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
  const loadMockScene = useGameStore((s) => s.loadMockScene);
  const gatheredAtTable = useGameStore((s) => s.gatheredAtTable);
  const gatherAtTable = useGameStore((s) => s.gatherAtTable);
  const prepareLiveSession = useGameStore((s) => s.prepareLiveSession);
  const addChatMessage = useGameStore((s) => s.addChatMessage);
  const setTyping = useGameStore((s) => s.setTyping);
  const applyUiSnapshot = useGameStore((s) => s.applyUiSnapshot);
  const restoreMockSnapshot = useGameStore((s) => s.restoreMockSnapshot);
  const brigCharacterIds = useGameStore((s) => s.brigCharacterIds);
  const votes = useGameStore((s) => s.votes);
  const privateThreads = usePrivateChatStore((s) => s.threads);
  const privateUnread = usePrivateChatStore((s) => s.unread);

  // Probe whether Continue should show
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = loadActiveSession();
      if (!active) {
        if (!cancelled) {
          setCanContinue(false);
          setBootChecked(true);
        }
        return;
      }

      if (active.mode === 'mock') {
        const snap = loadUiSnapshot(active.roomId);
        if (!cancelled) {
          setCanContinue(Boolean(snap));
          setBootChecked(true);
        }
        return;
      }

      // Live: Continue only if server says resumable (Redis still alive).
      // Do NOT fall back to snapshot-only — that would recreate an empty room.
      try {
        const detail = await fetchSession(active.roomId);
        if (!cancelled) {
          setCanContinue(detail.resumable);
          if (!detail.resumable) {
            clearAllSessionPersistence(active.roomId);
          }
        }
      } catch {
        if (!cancelled) {
          setCanContinue(false);
        }
      } finally {
        if (!cancelled) setBootChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Debounced UI snapshot while in a match
  useEffect(() => {
    if (mode !== 'mock' && mode !== 'live') return;
    scheduleUiSnapshotSave(() => buildSnapshot(mode));
  }, [
    mode,
    gameState,
    gatheredAtTable,
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

  // Immediate pointer+snapshot when entering a match (don't wait for debounce)
  useEffect(() => {
    if (mode !== 'mock' && mode !== 'live') return;
    flushUiSnapshotSave(() => buildSnapshot(mode));
  }, [mode, roomId, clientId]);

  // Flush snapshot before tab close / refresh so Continue sees latest state
  useEffect(() => {
    if (mode !== 'mock' && mode !== 'live') return;
    const flush = () => flushUiSnapshotSave(() => buildSnapshot(mode));
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [mode]);

  const handleJoinMock = useCallback(() => {
    clearAllSessionPersistence();
    setLobbyError(null);
    loadMockScene();
    setMode('mock');
  }, [loadMockScene]);

  const handleJoinLive = useCallback(
    (rid: string, cid: string) => {
      clearAllSessionPersistence();
      setLobbyError(null);
      prepareLiveSession(rid, cid);
      connect(rid, cid);
      setMode('live');
    },
    [connect, prepareLiveSession],
  );

  const handleContinue = useCallback(async () => {
    const active = loadActiveSession();
    if (!active) return;
    const snap = loadUiSnapshot(active.roomId);
    setLobbyError(null);

    if (active.mode === 'mock') {
      if (!snap) {
        setCanContinue(false);
        return;
      }
      restoreMockSnapshot(snap);
      setMode('mock');
      return;
    }

    // Live: re-check Redis before reconnecting
    try {
      const detail = await fetchSession(active.roomId);
      if (!detail.resumable) {
        clearAllSessionPersistence(active.roomId);
        setCanContinue(false);
        setLobbyError('Сессия больше недоступна. Начните Live Session заново.');
        return;
      }
    } catch {
      setCanContinue(false);
      setLobbyError('Сервер недоступен. Нельзя продолжить Live Session.');
      return;
    }

    useGameStore.setState({
      roomId: active.roomId,
      clientId: active.clientId,
      connected: false,
      chat: [],
      typing: [],
      error: null,
      sessionAges: snap?.sessionAges ?? useGameStore.getState().sessionAges,
      brigCharacterIds: [],
      votes: {},
    });
    usePrivateChatStore.getState().reset();
    usePrivateChatStore.getState().setLiveMode(true);
    connect(active.roomId, active.clientId);
    setMode('live');
  }, [connect, restoreMockSnapshot]);

  // Overlay UI snapshot after live room state arrives
  useEffect(() => {
    if (mode !== 'live' || !connected || !roomId) return;
    const snap = loadUiSnapshot(roomId);
    if (snap) applyUiSnapshot(snap);
  }, [mode, connected, roomId, applyUiSnapshot]);

  const handleLeave = useCallback(async () => {
    const game = useGameStore.getState();
    const rid = game.roomId;
    const currentMode = mode;

    flushUiSnapshotSave(() => buildSnapshot(currentMode === 'mock' ? 'mock' : 'live'));

    if (currentMode === 'live' && rid) {
      try {
        const isResolve = game.gameState === 'RESOLVE';
        await finishSession(rid, {
          winningTeam: isResolve ? 'DRAW' : 'ABORTED',
          brigAgents: game.brigCharacterIds,
        });
      } catch {
        // Still leave locally even if finish fails (room may already be gone)
      }
      disconnect();
    }

    clearAllSessionPersistence(rid);
    useGameStore.getState().reset();
    usePrivateChatStore.getState().reset();
    setSelectedPlayerId(null);
    setCanContinue(false);
    setLobbyError(null);
    setMode('lobby');
  }, [mode, disconnect]);

  const handleSendChat = useCallback(
    (text: string) => {
      if (mode === 'mock') {
        addChatMessage({
          sender: myProfile?.name ?? 'Вы',
          text,
          timestamp: new Date().toISOString(),
        });
        setTyping(myProfile?.name ?? 'Вы');
        return;
      }
      playChatSendSoundEffect();
      send({ action: 'chat', text });
    },
    [mode, send, addChatMessage, myProfile, setTyping],
  );

  const handleSendPrivate = useCallback(
    (agentId: string, partnerName: string, text: string) => {
      usePrivateChatStore.getState().sendMessage(agentId, partnerName, text);
      if (mode === 'live') {
        send({
          action: 'private_chat_send',
          type: 'private_chat_send',
          text,
          agent_id: agentId,
          payload: { agent_id: agentId },
        });
      }
    },
    [mode, send],
  );

  if (mode === 'history') {
    return <SessionHistoryScreen onBack={() => setMode('lobby')} />;
  }

  if (!bootChecked || mode === 'lobby') {
    return (
      <LobbyScreen
        onJoinMock={handleJoinMock}
        onJoinLive={handleJoinLive}
        onContinue={() => {
          void handleContinue();
        }}
        onOpenHistory={() => setMode('history')}
        canContinue={canContinue}
        error={lobbyError ?? error}
      />
    );
  }

  return (
    <GameScene
      gameState={gameState}
      players={players}
      gatheredAtTable={gatheredAtTable}
      onGatherAtTable={gatherAtTable}
      chat={chat}
      typing={typing}
      myProfile={myProfile}
      connected={connected}
      roomId={roomId}
      clientId={clientId}
      mockMode={mode === 'mock'}
      selectedPlayerId={selectedPlayerId}
      onSelectPlayer={setSelectedPlayerId}
      onSendChat={handleSendChat}
      onSendPrivate={handleSendPrivate}
      onLeave={handleLeave}
    />
  );
}
