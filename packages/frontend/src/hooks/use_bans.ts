import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useBannedPlayers(serverId: string) {
  return useQuery({
    queryKey: ['players', 'bannedPlayers', serverId],
    queryFn: async () => {
      const result = await apiClient.players.bannedPlayers({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useBannedIps(serverId: string) {
  return useQuery({
    queryKey: ['players', 'bannedIps', serverId],
    queryFn: async () => {
      const result = await apiClient.players.bannedIps({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

type BannedEntry = { name?: string; ip?: string; [key: string]: unknown };

export function usePardon(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['players', 'bannedPlayers', serverId];

  return useMutation({
    mutationFn: async (playerName: string) => {
      const result = await apiClient.players.pardon({ params: { serverId, playerName } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async (playerName) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<BannedEntry>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<BannedEntry>>(
          queryKey,
          previous.filter((entry) => entry.name !== playerName)
        );
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('players.pardonSent') });
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

export function usePardonIp(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['players', 'bannedIps', serverId];

  return useMutation({
    mutationFn: async (ip: string) => {
      const result = await apiClient.players.pardonIp({ params: { serverId, ip } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async (ip) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<BannedEntry>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<BannedEntry>>(
          queryKey,
          previous.filter((entry) => entry.ip !== ip)
        );
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('players.pardonIpSent') });
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
