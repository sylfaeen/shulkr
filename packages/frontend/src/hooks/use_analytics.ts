import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

type Period = '24h' | '7d' | '30d';

export function useActivity(serverId: string, period: Period) {
  return useQuery({
    queryKey: ['analytics', serverId, 'activity', period],
    queryFn: async () => {
      const result = await apiClient.analytics.activity({ params: { serverId }, query: { period } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function usePeakHours(serverId: string, period: Period) {
  return useQuery({
    queryKey: ['analytics', serverId, 'peak-hours', period],
    queryFn: async () => {
      const result = await apiClient.analytics.peakHours({ params: { serverId }, query: { period } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useSessionDuration(serverId: string, period: Period) {
  return useQuery({
    queryKey: ['analytics', serverId, 'session-duration', period],
    queryFn: async () => {
      const result = await apiClient.analytics.sessionDuration({ params: { serverId }, query: { period } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useRetention(serverId: string, weeks = 8) {
  return useQuery({
    queryKey: ['analytics', serverId, 'retention', weeks],
    queryFn: async () => {
      const result = await apiClient.analytics.retention({ params: { serverId }, query: { weeks } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useAnalyticsSummary(serverId: string, period: Period) {
  return useQuery({
    queryKey: ['analytics', serverId, 'summary', period],
    queryFn: async () => {
      const result = await apiClient.analytics.summary({ params: { serverId }, query: { period } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}
