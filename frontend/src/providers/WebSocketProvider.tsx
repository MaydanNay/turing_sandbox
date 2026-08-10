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
  connect: (
    roomId: string,
    clientId: string,
    options?: { seatToken?: string | null },
  ) => void;
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
  const queueRef = useRef<WsOutboundAction[]>([]);
  const handleBackendMessage = useGameStore((s) => s.handleBackendMessage);
  const handleClientMessage = useGameStore((s) => s.handleClientMessage);
  const setConnected = useGameStore((s) => s.setConnected);
  const setConnectionMeta = useGameStore((s) => s.setConnectionMeta);
  const setError = useGameStore((s) => s.setError);

  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current !== null) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    // Code 4000 indicates intentional manual disconnect
    wsRef.current?.close(4000);
    wsRef.current = null;
    setConnected(false);
  }, [setConnected]);

  const connect = useCallback(
    (roomId: string, clientId: string, options?: { seatToken?: string | null }) => {
      disconnect();
      setConnectionMeta(roomId, clientId);
      setError(null);

      const seatToken = options?.seatToken ?? null;
      const url = buildWsUrl(roomId, clientId, seatToken);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (queueRef.current.length > 0) {
          queueRef.current.forEach((msg) => ws.send(JSON.stringify(msg)));
          queueRef.current = [];
        }
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 30000); // Send ping every 30s
      };
      ws.onclose = (e) => {
        if (pingIntervalRef.current !== null) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        setConnected(false);
        // Do not auto-reconnect if closed normally (e.g., manual disconnect)
        // Reconnect without seat_token — player already holds an alive seat
        if (e.code !== 1000 && e.code !== 4000) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect(roomId, clientId);
          }, 3000); // 3 seconds backoff
        }
      };
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
    } else {
      queueRef.current.push(payload);
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
