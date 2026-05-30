import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise, ApiError } from '@shulkr/frontend/lib/api';

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
      const hasUploading = query.state.data?.some((b) => b.cloudUploadStatus === 'uploading');
      if (hasCreating) return 2000;
      if (hasUploading) return 5000;

      return 10000;
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

export function useUploadBackupToCloud(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filename, cloudDestinationId }: { filename: string; cloudDestinationId: string }) => {
      const result = await apiClient.servers.uploadBackupToCloud({
        params: { filename },
        body: { cloudDestinationId },
      });

      if (result.status !== 202) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'listBackups', serverId] }).then();
      addToast({ type: 'success', title: t('toast.backupUploadQueued') });
    },
    onError: (error: unknown) => {
      const code = error instanceof ApiError ? error.code : 'upload_failed';

      addToast({
        type: 'error',
        title: t('toast.backupUploadToCloudError'),
        description: t(`backups.uploadErrors.${code}`, { defaultValue: code }),
      });
    },
  });
}

export function useShareLinks(filename: string | null) {
  return useQuery({
    queryKey: ['servers', 'backupShareLinks', filename],
    queryFn: async () => {
      const result = await apiClient.servers.listBackupShareLinks({ params: { filename: filename! } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    enabled: !!filename,
  });
}

export function useCreateShareLink() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filename, expiresInHours }: { filename: string; expiresInHours: number }) => {
      const result = await apiClient.servers.createBackupShareLink({ params: { filename }, body: { expiresInHours } });
      if (result.status !== 201) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: (_data, { filename }) => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'backupShareLinks', filename] }).then();
    },
    onError: (error: unknown) => {
      const code = error instanceof ApiError ? error.code : 'unknown';

      addToast({
        type: 'error',
        title: t('backups.share.createError'),
        description: t(`backups.share.errors.${code}`, { defaultValue: '' }),
      });
    },
  });
}

export function useRevokeShareLink(filename: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.servers.revokeBackupShareLink({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'backupShareLinks', filename] }).then();
      addToast({ type: 'success', title: t('backups.share.revoked') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('backups.share.revokeError') });
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
