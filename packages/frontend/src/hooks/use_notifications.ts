import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await apiClient.notifications.list({ query: { limit: 50 } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useUnreadCount() {
  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const result = await apiClient.notifications.unreadCount({});
      if (result.status !== 200) raise(result.body, result.status);
      return result.body.count;
    },
    refetchInterval: 60_000,
  });

  return query;
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: number) => {
      const result = await apiClient.notifications.markRead({ params: { notificationId: String(notificationId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.notifications.markAllRead({});
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}
