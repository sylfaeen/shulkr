import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';

const QUERY_KEY = ['global-ip-bans', 'list'] as const;

export function useGlobalIpBans() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await apiClient.globalIpBans.list();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body.bans;
    },
  });
}

export function useAddGlobalIpBan() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ip: string; reason?: string; player_name?: string }) => {
      const result = await apiClient.globalIpBans.add({ body: input });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).then();
      addToast({ type: 'success', title: t('toast.globalIpBanAdded') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.globalIpBanAddError'), description: error.message });
    },
  });
}

export function useRemoveGlobalIpBan() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (banId: number) => {
      const result = await apiClient.globalIpBans.remove({ params: { banId: String(banId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).then();
      addToast({ type: 'success', title: t('toast.globalIpBanRemoved') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.globalIpBanRemoveError') });
    },
  });
}
