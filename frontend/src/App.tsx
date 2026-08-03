import { useCallback, useState } from 'react';

import { GameScene } from '@/components/GameScene';
import { LobbyScreen } from '@/components/LobbyScreen';
import { mapFrontendPhase } from '@/config/env';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useGameStore } from '@/store/gameStore';
import type { GamePhase } from '@/types/game';

type AppMode = 'lobby' | 'mock' | 'live';

const PHASE_ORDER: GamePhase[] = ['INIT', 'PITCH', 'CONFLICT', 'VOTE', 'RESOLVE'];

export default function App() {
  const [mode, setMode] = useState<AppMode>('lobby');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { connect, send } = useWebSocket();

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
  const cycleMockPhase = useGameStore((s) => s.cycleMockPhase);
  const addChatMessage = useGameStore((s) => s.addChatMessage);
  const bumpSuspicion = useGameStore((s) => s.bumpSuspicion);
  const setTyping = useGameStore((s) => s.setTyping);

  const handleJoinMock = useCallback(() => {
    loadMockScene();
    setMode('mock');
  }, [loadMockScene]);

  const handleJoinLive = useCallback(
    (rid: string, cid: string) => {
      prepareLiveSession(rid, cid);
      connect(rid, cid);
      setMode('live');
    },
    [connect, prepareLiveSession],
  );

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
      send({ action: 'chat', text });
    },
    [mode, send, addChatMessage, myProfile, setTyping],
  );

  const handlePitch = useCallback(
    (text: string) => {
      if (mode === 'mock') {
        addChatMessage({
          sender: myProfile?.name ?? 'Вы',
          text: `[PITCH] ${text}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      send({ action: 'pitch', text });
    },
    [mode, send, addChatMessage, myProfile],
  );

  const handleVote = useCallback(
    (targetId: string) => {
      if (mode === 'mock') {
        bumpSuspicion(targetId, 25);
        addChatMessage({
          sender: myProfile?.name ?? 'Вы',
          text: `Голосую за изгнание: ${players.find((p) => p.id === targetId)?.name ?? targetId}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      send({ action: 'vote', text: targetId, payload: { target: targetId } });
      bumpSuspicion(targetId, 15);
    },
    [mode, send, bumpSuspicion, addChatMessage, myProfile, players],
  );

  const handleAdvancePhase = useCallback(() => {
    const idx = PHASE_ORDER.indexOf(gameState);
    const next = PHASE_ORDER[idx + 1] ?? PHASE_ORDER[0];
    if (next) {
      send({ action: 'phase', text: mapFrontendPhase(next) });
    }
  }, [gameState, send]);

  if (mode === 'lobby') {
    return (
      <LobbyScreen
        onJoinMock={handleJoinMock}
        onJoinLive={handleJoinLive}
        error={error}
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
      onPitch={handlePitch}
      onVote={handleVote}
      onAdvancePhase={mode === 'live' ? handleAdvancePhase : undefined}
      onMockPhase={mode === 'mock' ? cycleMockPhase : undefined}
    />
  );
}
