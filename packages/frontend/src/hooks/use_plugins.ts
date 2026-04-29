import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export type PluginInfo = {
  name: string;
  filename: string;
  enabled: boolean;
  size: number;
  modified: string;
  version: string | null;
  description: string | null;
  authors: Array<string>;
  marketplaceSource: 'modrinth' | 'hangar' | null;
  marketplaceProjectId: string | null;
  marketplaceVersionId: string | null;
};

export function usePlugins(serverId: string | null) {
  return useQuery({
    queryKey: ['plugins', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.plugins.list({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useUploadPlugin(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/servers/${serverId}/plugins`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to upload plugin');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.pluginUploaded') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.pluginUploadError') });
    },
  });
}

export function useTogglePlugin(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['plugins', 'list', serverId];
  const mutation = useMutation({
    mutationFn: async ({ filename }: { filename: string }) => {
      const result = await apiClient.plugins.toggle({ params: { serverId: String(serverId) }, body: { filename } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async ({ filename }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<PluginInfo>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<PluginInfo>>(
          queryKey,
          previous.map((p) => (p.filename === filename ? { ...p, enabled: !p.enabled } : p))
        );
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.pluginToggled') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.pluginToggleError') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
  });
  return {
    ...mutation,
    mutateAsync: (filename: string) => mutation.mutateAsync({ filename }),
  };
}

export function useDeletePlugin(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ filename }: { filename: string }) => {
      const result = await apiClient.plugins.delete({ params: { serverId: String(serverId), filename } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.pluginDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.pluginDeleteError') });
    },
  });
  return {
    ...mutation,
    mutateAsync: (filename: string) => mutation.mutateAsync({ filename }),
  };
}

export function formatPluginSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
