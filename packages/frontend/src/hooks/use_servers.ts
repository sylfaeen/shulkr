import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';

function useErrorDescription() {
  const { t } = useTranslation();

  return (error: { message: string }) => {
    const key = `errors.${error.message}`;
    const translated = t(key);
    return translated !== key ? translated : undefined;
  };
}

export function useServers() {
  return useQuery({
    queryKey: ['servers', 'list'],
    queryFn: async () => {
      const result = await apiClient.servers.list();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    refetchInterval: 5000,
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: ['servers', 'byId', id],
    queryFn: async () => {
      const result = await apiClient.servers.byId({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      min_ram: string;
      max_ram: string;
      jvm_flags: string;
      java_port: number;
      auto_start: boolean;
    }) => {
      const result = await apiClient.servers.create({ body: input });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverCreated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverCreateError'), description: getDescription(error) });
    },
  });
}

export function useUpdateServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      min_ram?: string;
      max_ram?: string;
      jvm_flags?: string;
      java_port?: number;
      java_path?: string | null;
      auto_start?: boolean;
      max_backups?: number;
    }) => {
      const { id, ...body } = input;
      const result = await apiClient.servers.update({ params: { id: String(id) }, body });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverUpdated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverUpdateError'), description: getDescription(error) });
    },
  });
}

export function useDeleteServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id, createBackup }: { id: string; createBackup: boolean }) => {
      const result = await apiClient.servers.delete({ params: { id: String(id) }, query: { createBackup } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverDeleted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverDeleteError'), description: getDescription(error) });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string, createBackup?: boolean) => mutation.mutateAsync({ id, createBackup: createBackup ?? false }),
  };
}

export function useBackupServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();

  const mutation = useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths?: Array<string> }) => {
      const result = await apiClient.servers.backup({ params: { id: String(id) }, body: { paths } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.backupCreated') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.backupCreateError'), description: getDescription(error) });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string, paths?: Array<string>) => mutation.mutateAsync({ id, paths }),
  };
}

export function useStartServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const result = await apiClient.servers.start({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverStarted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverStartError'), description: getDescription(error) });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}

export function useStopServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const result = await apiClient.servers.stop({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverStopped') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverStopError'), description: getDescription(error) });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}

export function useRestartServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const getDescription = useErrorDescription();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const result = await apiClient.servers.restart({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.serverRestarted') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.serverRestartError'), description: getDescription(error) });
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}
