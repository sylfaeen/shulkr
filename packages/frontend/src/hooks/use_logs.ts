import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export type LogFile = {
  filename: string;
  size: number;
  modified: string;
  isLatest: boolean;
};

export type LogLine = {
  time?: string;
  thread?: string;
  level?: string;
  message: string;
};

export function useLogFiles(serverId: string | null) {
  return useQuery({
    queryKey: ['logs', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.logs.list({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useLogContent(serverId: string | null, filename: string | null) {
  return useQuery({
    queryKey: ['logs', 'read', serverId, filename],
    queryFn: async () => {
      const result = await apiClient.logs.read({
        params: { serverId: String(serverId!) },
        query: { filename: filename! },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && !!filename,
  });
}

export function useDeleteLog(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filename }: { filename: string }) => {
      const result = await apiClient.logs.delete({ params: { serverId, filename } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.logArchiveDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.logArchiveDeleteError') });
    },
  });
}

export function useMergePreview(serverId: string) {
  return useMutation({
    mutationFn: async ({ filenames }: { filenames: Array<string> }) => {
      const result = await apiClient.logs.mergePreview({ params: { serverId }, body: { filenames } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useMergeLogs(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ filenames, force }: { filenames: Array<string>; force?: boolean }) => {
      const result = await apiClient.logs.merge({ params: { serverId }, body: { filenames, force } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['logs', 'list', serverId] }).then();
      addToast({
        type: 'success',
        title: data.filenames.length > 1
          ? t('toast.logArchivesMergedMultiple', { count: data.filenames.length })
          : t('toast.logArchivesMerged'),
      });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.logArchivesMergeError') });
    },
  });
}

export function formatLogSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
