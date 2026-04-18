import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type { CreateCloudDestinationInput, UpdateCloudDestinationInput } from '@shulkr/shared';

export function useCloudDestinations() {
  return useQuery({
    queryKey: ['cloud-destinations', 'list'],
    queryFn: async () => {
      const result = await apiClient.cloudDestinations.list();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body.destinations;
    },
  });
}

export function useCreateCloudDestination() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateCloudDestinationInput) => {
      const result = await apiClient.cloudDestinations.create({ body });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-destinations', 'list'] }).then();
      addToast({ type: 'success', title: t('cloudDestinations.toast.created') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.genericError') });
    },
  });
}

export function useUpdateCloudDestination() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateCloudDestinationInput }) => {
      const result = await apiClient.cloudDestinations.update({ params: { id }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-destinations', 'list'] }).then();
      addToast({ type: 'success', title: t('cloudDestinations.toast.updated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.genericError') });
    },
  });
}

export function useDeleteCloudDestination() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.cloudDestinations.delete({ params: { id } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-destinations', 'list'] }).then();
      addToast({ type: 'success', title: t('cloudDestinations.toast.deleted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.genericError'), description: error instanceof Error ? error.message : undefined });
    },
  });
}

export function useTestCloudDestination() {
  return useMutation({
    mutationFn: async (body: CreateCloudDestinationInput) => {
      const result = await apiClient.cloudDestinations.test({ body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export type BackupStrategyInput = {
  mode: 'local-only' | 'cloud-only' | 'hybrid';
  cloudDestinationId?: string;
  localRetentionCount?: number;
  cloudRetentionDays?: number;
};

export function useBackupStrategy(serverId: string) {
  return useQuery({
    queryKey: ['backup-strategy', serverId],
    queryFn: async () => {
      const result = await apiClient.servers.getBackupStrategy({ params: { id: serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useUpdateBackupStrategy(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: BackupStrategyInput) => {
      const result = await apiClient.servers.updateBackupStrategy({ params: { id: serverId }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-strategy', serverId] }).then();
      addToast({ type: 'success', title: t('backupStrategy.toast.updated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.genericError') });
    },
  });
}
