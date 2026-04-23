import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export type MetricsPeriod = '1h' | '6h' | '24h' | '7d' | '30d';

export type MetricsPoint = {
  timestamp: string;
  cpu: number;
  memoryPercent: number;
  playerCount: number;
  tps: number | null;
  mspt: number | null;
};

export function useMetricsHistory(serverId: string, period: MetricsPeriod) {
  return useQuery({
    queryKey: ['metrics', 'history', serverId, period],
    queryFn: async () => {
      const result = await apiClient.metrics.history({
        params: { serverId },
        query: { period },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
    refetchInterval: 60_000,
  });
}
