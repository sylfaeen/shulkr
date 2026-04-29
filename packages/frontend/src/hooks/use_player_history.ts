import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function usePlayerHistory(serverId: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['players', 'history', serverId, limit, offset],
    queryFn: async () => {
      const result = await apiClient.players.history({
        params: { serverId },
        query: { limit, offset },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
    refetchInterval: 30_000,
  });
}
