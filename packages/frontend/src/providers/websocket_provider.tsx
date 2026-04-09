import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

const WS_URL = getWsUrl();

type WebSocketContextValue = {
  socket: WebSocket | null;
  isConnected: boolean;
  subscribe: (serverId: string) => void;
  unsubscribe: (serverId: string) => void;
  send: (message: Record<string, unknown>) => void;
  addListener: (type: string, handler: (message: Record<string, unknown>) => void) => () => void;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}

type WebSocketProviderProps = {
  children: ReactNode;
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef(new Map<string, Set<(message: Record<string, unknown>) => void>>());
  const subscribedRef = useRef(new Set<string>());
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const connect = useCallback(() => {
    if (!accessToken || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws`, ['access_token', accessToken]);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Re-subscribe to previously subscribed servers
      for (const serverId of subscribedRef.current) {
        ws.send(JSON.stringify({ type: 'channel:subscribe', serverId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;
        const type = message.type as string;
        const handlers = listenersRef.current.get(type);
        if (handlers) {
          for (const handler of handlers) {
            handler(message);
          }
        }
        // Also emit to wildcard listeners
        const wildcardHandlers = listenersRef.current.get('*');
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            handler(message);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      wsRef.current = null;
      if (event.code !== 1000 && event.code < 4000) {
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      // onclose will fire after
    };
  }, [accessToken]);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect();
    }
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, accessToken, connect]);

  // Ping keepalive
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const subscribe = useCallback((serverId: string) => {
    subscribedRef.current.add(serverId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'channel:subscribe', serverId }));
    }
  }, []);

  const unsubscribe = useCallback((serverId: string) => {
    subscribedRef.current.delete(serverId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'channel:unsubscribe', serverId }));
    }
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const addListener = useCallback((type: string, handler: (message: Record<string, unknown>) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext value={{ socket: wsRef.current, isConnected, subscribe, unsubscribe, send, addListener }}>
      {children}
    </WebSocketContext>
  );
}
