import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import { buildWsUrl } from '@/config/env';
import { useGameStore } from '@/store/gameStore';
import type { BackendWsMessage, WsClientMessage, WsOutboundAction } from '@/types/game';

interface WebSocketContextValue {
  connect: (roomId: string, clientId: string) => void;
  disconnect: () => void;
  send: (payload: WsOutboundAction) => void;
  sendClientMessage: (payload: WsClientMessage) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

function isBackendMessage(data: unknown): data is BackendWsMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string'
  );
}

function isClientMessage(data: unknown): data is WsClientMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'action' in data &&
    typeof (data as { action: unknown }).action === 'string' &&
    !('type' in data)
  );
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handleBackendMessage = useGameStore((s) => s.handleBackendMessage);
  const handleClientMessage = useGameStore((s) => s.handleClientMessage);
  const setConnected = useGameStore((s) => s.setConnected);
  const setConnectionMeta = useGameStore((s) => s.setConnectionMeta);
  const setError = useGameStore((s) => s.setError);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, [setConnected]);

  const connect = useCallback(
    (roomId: string, clientId: string) => {
      disconnect();
      setConnectionMeta(roomId, clientId);
      setError(null);

      const url = buildWsUrl(roomId, clientId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setError('WebSocket connection error');
      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const data: unknown = JSON.parse(event.data);
          if (isBackendMessage(data)) {
            handleBackendMessage(data);
          } else if (isClientMessage(data)) {
            handleClientMessage(data);
          }
        } catch {
          setError('Invalid WS payload');
        }
      };
    },
    [
      disconnect,
      handleBackendMessage,
      handleClientMessage,
      setConnected,
      setConnectionMeta,
      setError,
    ],
  );

  const send = useCallback((payload: WsOutboundAction) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendClientMessage = useCallback((payload: WsClientMessage) => {
    handleClientMessage(payload);
  }, [handleClientMessage]);

  useEffect(() => () => disconnect(), [disconnect]);

  return (
    <WebSocketContext.Provider value={{ connect, disconnect, send, sendClientMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
