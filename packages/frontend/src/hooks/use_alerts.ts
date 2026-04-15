import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useAlertRules(serverId: string) {
  return useQuery({
    queryKey: ['alerts', serverId],
    queryFn: async () => {
      const result = await apiClient.alerts.list({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useCreateAlert(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      name: string;
      metric: 'cpu' | 'ram' | 'disk' | 'tps';
      operator: '>' | '<' | '>=' | '<=';
      threshold: number;
      actions: Array<string>;
    }) => {
      const result = await apiClient.alerts.create({ params: { serverId }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', serverId] });
      addToast({ type: 'success', title: t('toast.alertCreated') });
    },
  });
}

export function useUpdateAlert(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      alertId,
      body,
    }: {
      alertId: number;
      body: {
        name?: string;
        metric?: 'cpu' | 'ram' | 'disk' | 'tps';
        operator?: '>' | '<' | '>=' | '<=';
        threshold?: number;
        actions?: Array<string>;
        enabled?: boolean;
      };
    }) => {
      const result = await apiClient.alerts.update({ params: { serverId, alertId: String(alertId) }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', serverId] });
    },
  });
}

export function useDeleteAlert(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: number) => {
      const result = await apiClient.alerts.delete({ params: { serverId, alertId: String(alertId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', serverId] });
      addToast({ type: 'success', title: t('toast.alertDeleted') });
    },
  });
}

export function useAlertEvents(serverId: string) {
  return useQuery({
    queryKey: ['alerts', serverId, 'events'],
    queryFn: async () => {
      const result = await apiClient.alerts.events({ params: { serverId }, query: { limit: 50 } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}
