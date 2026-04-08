import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useWorlds(serverId: string) {
  return useQuery({
    queryKey: ['worlds', serverId],
    queryFn: async () => {
      const result = await apiClient.worlds.list({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useSetActiveWorld(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (worldName: string) => {
      const result = await apiClient.worlds.setActive({ params: { serverId }, body: { worldName } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', serverId] }).then();
      addToast({ type: 'success', title: t('worlds.activeChanged') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('worlds.activeChangeError') });
    },
  });
}

export function useResetWorld(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ worldName, createBackup }: { worldName: string; createBackup: boolean }) => {
      const result = await apiClient.worlds.reset({
        params: { serverId, worldName },
        query: { createBackup },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', serverId] }).then();
      addToast({ type: 'success', title: t('worlds.resetSuccess') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('worlds.resetError') });
    },
  });
}
