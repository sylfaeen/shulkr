import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type { WebhookLanguage } from '@shulkr/shared';

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
    mutationFn: async (body: {
      name: string;
      url: string;
      format: 'discord' | 'generic';
      language?: WebhookLanguage;
      events: Array<string>;
      messageTemplates?: Record<string, string> | null;
    }) => {
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
  const queryKey = ['webhooks', serverId];

  type WebhookEntry = { id: number; enabled?: boolean; [key: string]: unknown };

  return useMutation({
    mutationFn: async ({
      webhookId,
      body,
    }: {
      webhookId: number;
      body: {
        name?: string;
        url?: string;
        format?: 'discord' | 'generic';
        language?: WebhookLanguage;
        events?: Array<string>;
        messageTemplates?: Record<string, string> | null;
        enabled?: boolean;
      };
    }) => {
      const result = await apiClient.webhooks.update({ params: { serverId, webhookId: String(webhookId) }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async ({ webhookId, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<WebhookEntry>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<WebhookEntry>>(
          queryKey,
          previous.map((w) => (w.id === webhookId ? { ...w, ...body } : w))
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
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

export function useWebhookTemplates(language: WebhookLanguage) {
  return useQuery({
    queryKey: ['webhookTemplates', language],
    queryFn: async () => {
      const result = await apiClient.webhooks.templates({ query: { language } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: Infinity,
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
