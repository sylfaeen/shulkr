import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useWhitelist(serverId: string) {
  return useQuery({
    queryKey: ['players', 'whitelist', serverId],
    queryFn: async () => {
      const result = await apiClient.players.whitelist({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useWhitelistAdd(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const result = await apiClient.players.whitelistAdd({ params: { serverId }, body: { name } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['players', 'whitelist', serverId] });
      addToast({ type: 'success', title: t('players.whitelistAdd') });
    },
  });
}

export function useWhitelistRemove(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playerName: string) => {
      const result = await apiClient.players.whitelistRemove({ params: { serverId, playerName } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['players', 'whitelist', serverId] });
      addToast({ type: 'success', title: t('players.whitelistRemove') });
    },
  });
}
