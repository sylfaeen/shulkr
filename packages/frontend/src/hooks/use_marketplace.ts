import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';

type SearchOptions = {
  q?: string;
  category?: string;
  gameVersion?: string;
  loader?: string;
  limit?: number;
  offset?: number;
};

export function useMarketplaceSearch(options: SearchOptions, enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'search', options],
    queryFn: async () => {
      const result = await apiClient.marketplace.search({ query: options });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: enabled && !!options.q?.trim(),
  });
}

export function useMarketplaceProject(idOrSlug: string | null) {
  return useQuery({
    queryKey: ['marketplace', 'project', idOrSlug],
    queryFn: async () => {
      const result = await apiClient.marketplace.project({ params: { idOrSlug: idOrSlug! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!idOrSlug,
  });
}

export function useMarketplaceVersions(idOrSlug: string | null, gameVersion?: string, loader?: string) {
  return useQuery({
    queryKey: ['marketplace', 'versions', idOrSlug, gameVersion, loader],
    queryFn: async () => {
      const result = await apiClient.marketplace.versions({
        params: { idOrSlug: idOrSlug! },
        query: { gameVersion, loader },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!idOrSlug,
  });
}

export function useMarketplaceCategories() {
  return useQuery({
    queryKey: ['marketplace', 'categories'],
    queryFn: async () => {
      const result = await apiClient.marketplace.categories();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function usePluginUpdates(serverId: string | null) {
  return useQuery({
    queryKey: ['marketplace', 'updates', serverId],
    queryFn: async () => {
      const result = await apiClient.marketplace.updates({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInstallPlugin(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { projectId: string; versionId: string; filename: string; fileUrl: string; fileHash: string }) => {
      const result = await apiClient.marketplace.install({
        params: { serverId },
        body: input,
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['plugins', 'list', serverId] }).then();
      addToast({
        type: 'success',
        title: t('marketplace.installSuccess', { filename: data.filename }),
      });
    },
    onError: () => {
      addToast({ type: 'error', title: t('marketplace.installError') });
    },
  });
}
