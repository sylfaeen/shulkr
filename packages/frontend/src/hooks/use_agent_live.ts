import { useQuery } from '@tanstack/react-query';
import { apiClient, raise, ApiError } from '@shulkr/frontend/lib/api';

type Period = '1h' | '6h' | '24h' | '7d' | '30d';

export function useAgentLive(serverId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['server', serverId, 'agent', 'live'],
    queryFn: async () => {
      const result = await apiClient.agents.getAgentLive({ params: { id: serverId } });
      if (result.status === 404) return null;
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && enabled,
    refetchInterval: 5_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useAgentHistory(serverId: string, period: Period, enabled: boolean) {
  return useQuery({
    queryKey: ['server', serverId, 'agent', 'history', period],
    queryFn: async () => {
      const result = await apiClient.agents.getAgentHistory({
        params: { id: serverId },
        query: { period },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && enabled,
    refetchInterval: 30_000,
  });
}
