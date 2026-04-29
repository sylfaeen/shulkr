import { useEffect, useCallback } from 'react';
import { useWebSocket } from '@shulkr/frontend/providers/websocket_provider';

export function useServerChannel(serverId: string | null) {
  const { subscribe, unsubscribe, send, addListener, isConnected } = useWebSocket();
  useEffect(() => {
    if (!serverId) return;
    subscribe(serverId);
    return () => {
      unsubscribe(serverId);
    };
  }, [serverId, subscribe, unsubscribe]);
  const sendCommand = useCallback(
    (command: string): boolean => {
      if (!serverId || !isConnected) return false;
      send({ type: 'console:input', command, serverId });
      return true;
    },
    [serverId, isConnected, send]
  );
  const loadHistory = useCallback(
    (offset: number, limit = 100) => {
      if (!serverId) return;
      send({ type: 'console:history:load', serverId, offset, limit });
    },
    [serverId, send]
  );
  return {
    isConnected,
    sendCommand,
    loadHistory,
    addListener,
    send,
  };
}
