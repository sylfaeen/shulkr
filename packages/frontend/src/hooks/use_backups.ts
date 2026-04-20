import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useBackups(serverId: string | null) {
  return useQuery({
    queryKey: ['servers', 'listBackups', serverId],
    queryFn: async () => {
      const result = await apiClient.servers.listBackups({ params: { id: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
    refetchInterval: (query) => {
      const hasCreating = query.state.data?.some((b) => b.status === 'creating');
      return hasCreating ? 2000 : 10000;
    },
  });
}

export function useRenameBackup(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['servers', 'listBackups', serverId];
  type BackupEntry = { filename: string; [key: string]: unknown };
  return useMutation({
    mutationFn: async ({ filename, newFilename }: { filename: string; newFilename: string }) => {
      const result = await apiClient.servers.renameBackup({ params: { filename }, body: { newFilename } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async ({ filename, newFilename }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<BackupEntry>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<BackupEntry>>(
          queryKey,
          previous.map((b) => (b.filename === filename ? { ...b, filename: newFilename } : b))
        );
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.backupRenamed') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.backupRenameError') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
  });
}

export function useDeleteBackup(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ filename }: { filename: string }) => {
      const result = await apiClient.servers.deleteBackup({ params: { filename } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'listBackups', serverId] }).then();
      addToast({ type: 'success', title: t('toast.backupDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.backupDeleteError') });
    },
  });
}
