import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

type UseAuditLogsOptions = {
  userId?: number;
  limit?: number;
  offset?: number;
};

export function useAuditLogs({ userId, limit = 20, offset = 0 }: UseAuditLogsOptions) {
  return useQuery({
    queryKey: ['audit', 'list', { userId, limit, offset }],
    queryFn: async () => {
      const result = await apiClient.audit.list({ query: { userId, limit, offset } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: userId !== undefined,
  });
}
