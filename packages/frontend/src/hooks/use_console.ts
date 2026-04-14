import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import type { ServerMetrics, PlayerInfo } from '@shulkr/shared';

export interface ConsoleMessage {
  id: string;
  type: 'stdout' | 'stderr' | 'input' | 'system';
  data: string;
  timestamp: number;
  level?: string;
}

interface WebSocketMessage {
  type: string;
  serverId?: string;
  server_id?: number;
  outputType?: 'stdout' | 'stderr';
  data?: string;
  command?: string;
  user?: string;
  error?: string;
  message?: string;
  timestamp?: number;
  level?: string;
  metrics?: ServerMetrics | null;
  players?: Array<string>;
  playerDetails?: Array<PlayerInfo>;
  count?: number;
  hasMore?: boolean;
  totalLines?: number;
  offset?: number;
  lines?: Array<{ type: 'stdout' | 'stderr'; data: string; timestamp: number; level?: string }>;
}

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

const WS_URL = getWsUrl();
const MAX_MESSAGES = 2000;

export function useConsoleWebSocket(serverId: string | null) {
  const [messages, setMessages] = useState<Array<ConsoleMessage>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [players, setPlayers] = useState<Array<string>>([]);
  const [playerDetails, setPlayerDetails] = useState<Array<PlayerInfo>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadedOffsetRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const accessToken = useAuthStore((state) => state.accessToken);

  const addMessage = useCallback((message: ConsoleMessage) => {
    setMessages((prev) => {
      const newMessages = [...prev, message];
      // Keep only the last MAX_MESSAGES
      if (newMessages.length > MAX_MESSAGES) {
        return newMessages.slice(-MAX_MESSAGES);
      }
      return newMessages;
    });
  }, []);

  const addSystemMessage = useCallback(
    (text: string) => {
      addMessage({
        id: `system-${Date.now()}-${Math.random()}`,
        type: 'system',
        data: text,
        timestamp: Date.now(),
      });
    },
    [addMessage]
  );

  const connect = useCallback(() => {
    if (!serverId || !accessToken || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    const ws = new WebSocket(`${WS_URL}/ws/console?serverId=${serverId}`, ['access_token', accessToken]);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      addSystemMessage('Connected to console');

      ws.send(JSON.stringify({ type: 'metrics:subscribe' }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            addSystemMessage(`Authenticated as ${message.user}`);
            break;

          case 'console:history':
            if (message.lines) {
              const historyMessages = message.lines.map(
                (line: { type: 'stdout' | 'stderr'; data: string; timestamp: number; level?: string }) => ({
                  id: `history-${line.timestamp}-${Math.random()}`,
                  type: line.type,
                  data: line.data,
                  timestamp: line.timestamp,
                  level: line.level,

                })
              );
              setMessages(historyMessages);
              setHasMore(!!message.hasMore);
              loadedOffsetRef.current = historyMessages.length;
            }
            break;

          case 'console:history:page':
            if (message.lines) {
              const pageMessages = message.lines.map(
                (line: { type: 'stdout' | 'stderr'; data: string; timestamp: number; level?: string }) => ({
                  id: `history-${line.timestamp}-${Math.random()}`,
                  type: line.type,
                  data: line.data,
                  timestamp: line.timestamp,
                  level: line.level,

                })
              );
              setMessages((prev) => [...pageMessages, ...prev]);
              setHasMore(!!message.hasMore);
              loadedOffsetRef.current += pageMessages.length;
              setIsLoadingMore(false);
            }
            break;

          case 'console:batch':
            if (message.lines) {
              setMessages((prev) => {
                const batchMessages = message.lines!.map(
                  (line: { outputType?: string; data: string; timestamp: number; level?: string }) => ({
                    id: `${line.timestamp}-${Math.random()}`,
                    type: (line.outputType || 'stdout') as ConsoleMessage['type'],
                    data: line.data,
                    timestamp: line.timestamp || Date.now(),
                    level: line.level,
  
                  })
                );
                const newMessages = [...prev, ...batchMessages];
                return newMessages.length > MAX_MESSAGES ? newMessages.slice(-MAX_MESSAGES) : newMessages;
              });
            }
            break;

          case 'console:output':
            if (message.data) {
              addMessage({
                id: `${message.timestamp}-${Math.random()}`,
                type: message.outputType || 'stdout',
                data: message.data,
                timestamp: message.timestamp || Date.now(),
                level: message.level,
              });
            }
            break;

          case 'console:input:ack':
            addMessage({
              id: `input-${message.timestamp}-${Math.random()}`,
              type: 'input',
              data: `> ${message.command}`,
              timestamp: message.timestamp || Date.now(),
            });
            break;

          case 'server:started':
            addSystemMessage(`Server started (PID: ${message.serverId})`);
            break;

          case 'server:stopped':
            addSystemMessage('Server stopped');
            setMetrics(null);
            setPlayers([]);
            setPlayerDetails([]);
            break;

          case 'server:error':
            addSystemMessage(`Server error: ${message.error}`);
            break;

          case 'error':
            setError(message.message || 'Unknown error');
            addSystemMessage(`Error: ${message.message}`);
            break;

          case 'pong':
            break;

          case 'metrics:subscribed':
            break;

          case 'metrics:update':
            setMetrics(message.metrics || null);
            break;

          case 'server:players':
            setPlayers(message.players || []);
            setPlayerDetails(message.playerDetails || []);
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      if (event.code === 4001) {
        setError('Missing authentication token');
      } else if (event.code === 4002) {
        setError('Invalid or expired token');
      } else if (event.code === 4003) {
        setError('Insufficient permissions');
      } else if (event.code === 4004) {
        setError('Missing server ID');
      } else if (event.code === 4005) {
        setError('Invalid server ID');
      } else if (event.code !== 1000) {
        const attempt = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        reconnectAttemptsRef.current = attempt + 1;
        addSystemMessage(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      addSystemMessage('Connection error');
    };
  }, [serverId, accessToken, addMessage, addSystemMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const loadMore = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    wsRef.current.send(
      JSON.stringify({
        type: 'console:history:load',
        offset: loadedOffsetRef.current,
        limit: 100,
      })
    );
  }, [isLoadingMore, hasMore]);

  const sendCommand = useCallback((command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to server');
      return false;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'console:input',
        command,
      })
    );
    return true;
  }, []);

  // Auto-connect when serverId changes
  useEffect(() => {
    if (serverId && accessToken) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [serverId, accessToken, connect, disconnect]);

  // Ping to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  return {
    messages,
    isConnected,
    isConnecting,
    error,
    sendCommand,
    connect,
    disconnect,
    metrics,
    players,
    playerDetails,
    hasMore,
    isLoadingMore,
    loadMore,
  };
}
