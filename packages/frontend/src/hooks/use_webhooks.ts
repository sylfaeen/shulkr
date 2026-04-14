import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useWebhook(serverId: string, webhookId: number | null) {
  return useQuery({
    queryKey: ['webhooks', serverId, webhookId],
    queryFn: async () => {
      const result = await apiClient.webhooks.get({ params: { serverId, webhookId: String(webhookId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: webhookId !== null,
  });
}

export function useWebhooks(serverId: string) {
  return useQuery({
    queryKey: ['webhooks', serverId],
    queryFn: async () => {
      const result = await apiClient.webhooks.list({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useCreateWebhook(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { name: string; url: string; format: 'discord' | 'generic'; events: Array<string> }) => {
      const result = await apiClient.webhooks.create({ params: { serverId }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
      addToast({ type: 'success', title: t('toast.webhookCreated') });
    },
  });
}

export function useUpdateWebhook(serverId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      webhookId,
      body,
    }: {
      webhookId: number;
      body: { name?: string; url?: string; format?: 'discord' | 'generic'; events?: Array<string>; enabled?: boolean };
    }) => {
      const result = await apiClient.webhooks.update({ params: { serverId, webhookId: String(webhookId) }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
    },
  });
}

export function useDeleteWebhook(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (webhookId: number) => {
      const result = await apiClient.webhooks.delete({ params: { serverId, webhookId: String(webhookId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
      addToast({ type: 'success', title: t('toast.webhookDeleted') });
    },
  });
}

export function useTestWebhook(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async (webhookId: number) => {
      const result = await apiClient.webhooks.test({ params: { serverId, webhookId: String(webhookId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      addToast({
        type: data.success ? 'success' : 'error',
        title: data.success ? t('toast.webhookTestSuccess') : t('toast.webhookTestFailed'),
      });
    },
  });
}

export function useWebhookDeliveries(serverId: string, webhookId: number | null) {
  return useQuery({
    queryKey: ['webhooks', serverId, webhookId, 'deliveries'],
    queryFn: async () => {
      const result = await apiClient.webhooks.deliveries({
        params: { serverId, webhookId: String(webhookId!) },
        query: { limit: 50 },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: webhookId !== null,
  });
}

export function useWebhookDeliveryDetail(serverId: string, webhookId: number | null, deliveryId: number | null) {
  return useQuery({
    queryKey: ['webhooks', serverId, webhookId, 'deliveries', deliveryId],
    queryFn: async () => {
      const result = await apiClient.webhooks.deliveryDetail({
        params: { serverId, webhookId: String(webhookId!), deliveryId: String(deliveryId!) },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: webhookId !== null && deliveryId !== null,
  });
}
