import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type { DomainType } from '@shulkr/shared';

export function useDomains(serverId: string | null) {
  return useQuery({
    queryKey: ['domains', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.domains.list({ query: { serverId: serverId! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useAddDomain(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: { domain: string; port: number; type: DomainType }) => {
      const result = await apiClient.domains.add({ body: { serverId, ...input } });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.domainAdded') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.domainAddError'), description: error.message });
    },
  });
  return {
    ...mutation,
    mutateAsync: (input: { domain: string; port: number; type: DomainType }) => mutation.mutateAsync(input),
  };
}

export function useRemoveDomain(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.domains.remove({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.domainRemoved') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.domainRemoveError') });
    },
  });
  return {
    ...mutation,
    mutateAsync: (id: number) => mutation.mutateAsync({ id }),
  };
}

export function useEnableSsl(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.domains.enableSsl({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.sslEnabled') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sslEnableError'), description: error.message });
    },
  });
  return {
    ...mutation,
    mutateAsync: (id: number) => mutation.mutateAsync({ id }),
  };
}

export function useServerIp(): string {
  const { data } = useQuery({
    queryKey: ['settings', 'versionInfo'],
    queryFn: async () => {
      const result = await apiClient.settings.getVersionInfo();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
  return data?.ipAddress ?? '';
}

export function useRenewSsl(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.domains.renew();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.sslRenewed') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sslRenewError'), description: error.message });
    },
  });
  return mutation;
}

export function usePanelDomain() {
  return useQuery({
    queryKey: ['domains', 'panelDomain'],
    queryFn: async () => {
      const result = await apiClient.domains.panelDomain();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useSetPanelDomain() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ domain }: { domain: string }) => {
      const result = await apiClient.domains.setPanelDomain({ body: { domain } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'panelDomain'] }).then();
      addToast({ type: 'success', title: t('toast.panelDomainSet') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.panelDomainSetError'), description: error.message });
    },
  });
  return {
    ...mutation,
    mutateAsync: (domain: string) => mutation.mutateAsync({ domain }),
  };
}

export function useRemovePanelDomain() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.domains.removePanelDomain();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'panelDomain'] }).then();
      addToast({ type: 'success', title: t('toast.panelDomainRemoved') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.panelDomainRemoveError'), description: error.message });
    },
  });
  return mutation;
}

export function useEnablePanelSsl() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const result = await apiClient.domains.enableSsl({ params: { id: String(id) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'panelDomain'] }).then();
      addToast({ type: 'success', title: t('toast.sslEnabled') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.sslEnableError'), description: error.message });
    },
  });
  return {
    ...mutation,
    mutateAsync: (id: number) => mutation.mutateAsync({ id }),
  };
}
