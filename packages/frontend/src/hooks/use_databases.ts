import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import type { CreateDatabaseAccessRequest } from '@shulkr/shared';

export function useDatabaseEngine() {
  return useQuery({
    queryKey: ['databases', 'engine'],
    queryFn: async () => {
      const result = await apiClient.databases.engineStatus();
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
  });
}

export function useDatabases(serverId: string) {
  return useQuery({
    queryKey: ['databases', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.databases.list({ query: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useCreateDatabase(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (slug: string) => {
      const result = await apiClient.databases.create({ body: { serverId, slug } });
      if (result.status !== 201) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.databaseCreated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseCreateError'), description: error.message });
    },
  });

  return { ...mutation, mutateAsync: (slug: string) => mutation.mutateAsync(slug) };
}

// Not a query: the credentials are fetched on demand, each call is journalled server-side, and nothing is cached in the client.
export function useRevealDatabaseCredentials() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const result = await apiClient.databases.credentials({ params: { id } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseRevealError'), description: error.message });
    },
  });
}

export function useRotateDatabasePassword(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const result = await apiClient.databases.rotate({ params: { id }, body: {} });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.databasePasswordRotated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseRotateError'), description: error.message });
    },
  });
}

export function useDeleteDatabase(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, confirmation }: { id: number; confirmation: string }) => {
      const result = await apiClient.databases.remove({ params: { id }, body: { confirmation } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.databaseDeleted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseDeleteError'), description: error.message });
    },
  });
}

export function useDatabaseAccesses(databaseId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['databases', 'accesses', databaseId],
    queryFn: async () => {
      const result = await apiClient.databases.listAccesses({ params: { id: databaseId } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    enabled,
  });
}

export function useCreateDatabaseAccess(databaseId: number, serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDatabaseAccessRequest) => {
      const result = await apiClient.databases.createAccess({ params: { id: databaseId }, body: input });
      if (result.status !== 201) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases', 'accesses', databaseId] }).then();
      queryClient.invalidateQueries({ queryKey: ['databases', 'list', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['databases', 'engine'] }).then();
      addToast({ type: 'success', title: t('toast.databaseAccessCreated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseAccessCreateError'), description: error.message });
    },
  });
}

export function useRevealAccessCredentials(databaseId: number) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async (accessId: number) => {
      const result = await apiClient.databases.accessCredentials({ params: { id: databaseId, accessId } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseRevealError'), description: error.message });
    },
  });
}

export function useRotateAccessPassword(databaseId: number) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async (accessId: number) => {
      const result = await apiClient.databases.rotateAccess({ params: { id: databaseId, accessId }, body: {} });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.databasePasswordRotated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseRotateError'), description: error.message });
    },
  });
}

export function useRevokeDatabaseAccess(databaseId: number, serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accessId: number) => {
      const result = await apiClient.databases.revokeAccess({ params: { id: databaseId, accessId } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases', 'accesses', databaseId] }).then();
      queryClient.invalidateQueries({ queryKey: ['databases', 'list', serverId] }).then();
      queryClient.invalidateQueries({ queryKey: ['databases', 'engine'] }).then();
      addToast({ type: 'success', title: t('toast.databaseAccessRevoked') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.databaseAccessRevokeError'), description: error.message });
    },
  });
}

// The dump is streamed by the backend, so the browser downloads it like any file instead of holding it in memory.
export function useDownloadDatabase() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return (databaseId: number) => {
    const params = new URLSearchParams({ token: accessToken ?? '' });
    window.open(`/api/databases/${databaseId}/download?${params.toString()}`, '_blank');
  };
}
