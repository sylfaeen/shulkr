import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type { CreateSftpAccountRequest, UpdateSftpAccountRequest } from '@shulkr/shared';

export function useSftpInfo() {
  return useQuery({
    queryKey: ['sftp', 'info'],
    queryFn: async () => {
      const result = await apiClient.sftp.getInfo();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useSftpAccounts(serverId: string) {
  return useQuery({
    queryKey: ['sftp', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.sftp.list({ query: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useCreateSftpAccount(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: Omit<CreateSftpAccountRequest, 'serverId'>) => {
      const result = await apiClient.sftp.create({ body: { serverId, ...input } });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sftp', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.sftpAccountCreated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sftpAccountCreateError'), description: error.message });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: Omit<CreateSftpAccountRequest, 'serverId'>) => mutation.mutateAsync(input),
  };
}

export function useUpdateSftpAccount(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: UpdateSftpAccountRequest) => {
      const result = await apiClient.sftp.update({ params: { id: String(input.id) }, body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sftp', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.sftpAccountUpdated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sftpAccountUpdateError'), description: error.message });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: UpdateSftpAccountRequest) => mutation.mutateAsync(input),
  };
}

export function useDeleteSftpAccount(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.sftp.delete({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sftp', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.sftpAccountDeleted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sftpAccountDeleteError'), description: error.message });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: number) => mutation.mutateAsync({ id }),
  };
}
