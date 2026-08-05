import { useCallback, useState } from 'react';

import { GameScene } from '@/components/GameScene';
import { LobbyScreen } from '@/components/LobbyScreen';
import { playChatSendSoundEffect } from '@/hooks/useGeneralChatEffects';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useGameStore } from '@/store/gameStore';

type AppMode = 'lobby' | 'mock' | 'live';

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
  const addChatMessage = useGameStore((s) => s.addChatMessage);
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
      playChatSendSoundEffect();
      send({ action: 'chat', text });
    },
    [mode, send, addChatMessage, myProfile, setTyping],
  );

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
    />
  );
}
