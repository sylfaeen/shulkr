import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useGcMetrics(serverId: string, hours = 24) {
  return useQuery({
    queryKey: ['gc', serverId, hours],
    queryFn: async () => {
      const result = await apiClient.metrics.gc({ params: { serverId }, query: { hours } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    refetchInterval: 60_000,
  });
}
