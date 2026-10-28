import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, ApiError, raise } from '@shulkr/frontend/lib/api';
import { ErrorCodes, type DnsFailureReason, type DomainType } from '@shulkr/shared';

// Raised by useSetPanelDomain when the backend refuses the domain because it does not reach this server. Carries the reason and both IPs so the settings page can render the actual fix inline instead of a toast.
export class PanelDomainDnsMismatchError extends ApiError {
  readonly domain: string;
  readonly reason: DnsFailureReason;
  readonly resolvedIp: string | null;
  readonly serverIp: string | null;

  constructor(
    domain: string,
    body: { code: string; message: string; reason: DnsFailureReason; resolvedIp: string | null; serverIp: string | null }
  ) {
    super(body.message, body.code, 400);

    this.name = 'PanelDomainDnsMismatchError';
    this.domain = domain;
    this.reason = body.reason;
    this.resolvedIp = body.resolvedIp;
    this.serverIp = body.serverIp;
  }
}

// Raised by useSetPanelDomain when no certificate could be installed. The backend has already rolled the domain back, so the panel stays on its IP address; detail is the certbot output the settings page shows inline.
export class PanelDomainSslError extends ApiError {
  readonly detail: string;

  constructor(body: { code: string; message: string; detail: string }) {
    super(body.message, body.code, 422);

    this.name = 'PanelDomainSslError';
    this.detail = body.detail;
  }
}

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

      if (result.status === 400 && result.body.code === ErrorCodes.DOMAIN_DNS_MISMATCH) {
        throw new PanelDomainDnsMismatchError(domain, result.body);
      }

      if (result.status === 422) throw new PanelDomainSslError(result.body);

      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', 'panelDomain'] }).then();
      addToast({ type: 'success', title: t('toast.panelDomainSet') });
    },
    onError: (error) => {
      // The settings page renders the DNS mismatch and the certificate failure inline with their cause, a toast would only duplicate it.
      if (error instanceof PanelDomainDnsMismatchError || error instanceof PanelDomainSslError) return;
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
