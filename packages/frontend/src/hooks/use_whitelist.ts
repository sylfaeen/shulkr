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

type WhitelistData = { entries: Array<{ name: string; uuid?: string | null }> };

export function useWhitelistAdd(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['players', 'whitelist', serverId];

  return useMutation({
    mutationFn: async (name: string) => {
      const result = await apiClient.players.whitelistAdd({ params: { serverId }, body: { name } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WhitelistData>(queryKey);
      if (previous) {
        queryClient.setQueryData<WhitelistData>(queryKey, {
          entries: [...previous.entries, { name }],
        });
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('players.whitelistAdd') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.genericError') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
  });
}

export function useWhitelistRemove(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['players', 'whitelist', serverId];

  return useMutation({
    mutationFn: async (playerName: string) => {
      const result = await apiClient.players.whitelistRemove({ params: { serverId, playerName } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async (playerName) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WhitelistData>(queryKey);
      if (previous) {
        queryClient.setQueryData<WhitelistData>(queryKey, {
          entries: previous.entries.filter((e) => e.name !== playerName),
        });
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('players.whitelistRemove') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.genericError') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
  });
}
