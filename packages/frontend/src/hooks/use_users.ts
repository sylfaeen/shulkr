import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => {
      const result = await apiClient.users.list();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useUser(id: number) {
  return useQuery({
    queryKey: ['users', 'byId', id],
    queryFn: async () => {
      const result = await apiClient.users.byId({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; password: string; permissions: Array<string> }) => {
      const result = await apiClient.users.create({ body: input });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.userCreated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.userCreateError') });
    },
  });
}

export function useUpdateUser() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; username?: string; password?: string; permissions?: Array<string> }) => {
      const { id, ...body } = input;
      const result = await apiClient.users.update({ params: { id: String(id) }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.userUpdated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.userUpdateError') });
    },
  });
}

export function useDeleteUser() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.users.delete({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.userDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.userDeleteError') });
    },
  });
}
