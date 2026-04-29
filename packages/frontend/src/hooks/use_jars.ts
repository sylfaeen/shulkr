import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export type JarSource = 'papermc' | 'spigot' | 'purpur' | 'fabric' | 'forge' | 'vanilla' | 'custom';

export interface JarInfo {
  name: string;
  size: number;
  modified: string;
  isActive: boolean;
  source: JarSource;
}

export type PaperMCProject = 'paper' | 'folia' | 'velocity' | 'waterfall';

export function usePaperVersions(project: PaperMCProject) {
  return useQuery({
    queryKey: ['jars', 'versions', project],
    queryFn: async () => {
      const result = await apiClient.jars.getVersions({ query: { project } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaperBuilds(project: PaperMCProject, version: string | null) {
  return useQuery({
    queryKey: ['jars', 'builds', project, version],
    queryFn: async () => {
      const result = await apiClient.jars.getBuilds({ query: { project, version: version! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!version,
    staleTime: 5 * 60 * 1000,
  });
}

export function useServerJars(serverId: string | null) {
  return useQuery({
    queryKey: ['jars', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.jars.list({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useDownloadJar(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: { project: PaperMCProject; version: string; build?: number }) => {
      const result = await apiClient.jars.download({ params: { serverId: String(serverId) }, body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jars', 'list', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['servers', 'byId', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.jarDownloaded') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.jarDownloadError') });
    },
  });
  return {
    ...mutation,
    mutateAsync: (input: { project: PaperMCProject; version: string; build?: number }) => mutation.mutateAsync(input),
  };
}

export function useDownloadProgress(serverId: string | null, isDownloading: boolean) {
  return useQuery({
    queryKey: ['jars', 'progress', serverId],
    queryFn: async () => {
      const result = await apiClient.jars.progress({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && isDownloading,
    refetchInterval: isDownloading ? 500 : false,
  });
}

export function useSetActiveJar(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ jarFile }: { jarFile: string }) => {
      const result = await apiClient.jars.setActive({ params: { serverId: String(serverId) }, body: { jarFile } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jars', 'list', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['servers', 'byId', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.jarActivated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.jarActivateError') });
    },
  });
  return {
    ...mutation,
    mutateAsync: (jarFile: string) => mutation.mutateAsync({ jarFile }),
  };
}

export function useDeleteJar(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ jarFile }: { jarFile: string }) => {
      const result = await apiClient.jars.delete({ params: { serverId: String(serverId), jarFile } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jars', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.jarDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.jarDeleteError') });
    },
  });
  return {
    ...mutation,
    mutateAsync: (jarFile: string) => mutation.mutateAsync({ jarFile }),
  };
}

export function useUploadJar(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  return useMutation({
    mutationFn: async ({ file, setAsActive }: { file: File; setAsActive?: boolean }) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/servers/${serverId}/files/upload?path=/`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Upload failed');
      }
      const result = await response.json();
      if (setAsActive && result.data?.path) {
        const filename = result.data.path.split('/').pop();
        if (filename) {
          const setActiveResult = await apiClient.jars.setActive({
            params: { serverId: String(serverId) },
            body: { jarFile: filename },
          });
          if (setActiveResult.status !== 200) raise(setActiveResult.body, setActiveResult.status);
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jars', 'list', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['servers', 'byId', serverId] }).then();
      addToast({ type: 'success', title: t('toast.jarUploaded') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.jarUploadError') });
    },
  });
}

export function formatJarSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
