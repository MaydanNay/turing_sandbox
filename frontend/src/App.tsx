import { useCallback, useEffect, useState } from 'react';

import { fetchSession } from '@/api/sessions';
import { ChatToastStack } from '@/components/Chat/ChatToastStack';
import { GameScene } from '@/components/GameScene';
import { LobbyScreen } from '@/components/LobbyScreen';
import { SessionHistoryScreen } from '@/components/SessionHistoryScreen';
import { playChatSendSoundEffect } from '@/hooks/useGeneralChatEffects';
import { useT } from '@/i18n';
import { SceneEditorPage } from '@/pages/SceneEditorPage';
import { useWebSocket } from '@/providers/WebSocketProvider';
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

/** DEV-only dedicated editor at /scene-editor (also ?walkEdit=1 / ?sceneEdit=1). */
function shouldOpenSceneEditor(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/scene-editor') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('walkEdit') === '1' || params.get('sceneEdit') === '1') {
      window.history.replaceState({}, '', '/scene-editor');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
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
  if (shouldOpenSceneEditor()) {
    return <SceneEditorPage />;
  }
  return <AppMain />;
}

function AppMain() {
  const t = useT();
  const [mode, setMode] = useState<AppMode>('lobby');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [initialInviteCode, setInitialInviteCode] = useState<string | null>(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('invite');
      return raw ? raw.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });

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
    (rid: string, cid: string, options?: { seatToken?: string | null }) => {
      clearAllSessionPersistence();
      setLobbyError(null);
      setInitialInviteCode(null);
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('invite')) {
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
      } catch {
        /* ignore */
      }
      prepareLiveSession(rid, cid);
      saveActiveSession({
        mode: 'live',
        roomId: rid,
        clientId: cid,
        updatedAt: Date.now(),
      });
      connect(rid, cid, { seatToken: options?.seatToken });
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

    // Explicit leave → out of convoy; then disconnect (room keeps playing).
    if (mode === 'live' && rid) {
      try {
        send({ action: 'leave' });
        await new Promise((r) => window.setTimeout(r, 120));
      } catch {
        // Still disconnect locally
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
  }, [mode, disconnect, send]);

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
      return (
        <div
          className="min-h-screen bg-black"
          aria-busy
          aria-label={t('lobby.loadingSession')}
        />
      );
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
          initialInviteCode={initialInviteCode}
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
