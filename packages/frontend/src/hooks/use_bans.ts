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

export function usePardon(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playerName: string) => {
      const result = await apiClient.players.pardon({ params: { serverId, playerName } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players', 'bannedPlayers', serverId] }).then();
      addToast({ type: 'success', title: t('players.pardonSent') });
    },
  });
}

export function usePardonIp(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ip: string) => {
      const result = await apiClient.players.pardonIp({ params: { serverId, ip } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players', 'bannedIps', serverId] }).then();
      addToast({ type: 'success', title: t('players.pardonIpSent') });
    },
  });
}
