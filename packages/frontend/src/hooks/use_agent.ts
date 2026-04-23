import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AgentPlatform } from '@shulkr/shared';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';

function agentKey(serverId: string): Array<unknown> {
  return ['server', serverId, 'agent'];
}

export function useAgentStatus(serverId: string) {
  return useQuery({
    queryKey: agentKey(serverId),
    queryFn: async () => {
      const result = await apiClient.agents.getAgentStatus({ params: { id: serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
    refetchInterval: 10_000,
  });
}

export function useEnableAgent(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.agents.enableAgent({ params: { id: serverId }, body: {} });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKey(serverId) }).then();
      addToast({ type: 'success', title: t('toast.agentEnabled') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.agentEnableError') });
    },
  });
}

export function useDisableAgent(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.agents.disableAgent({ params: { id: serverId }, body: {} });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKey(serverId) }).then();
      addToast({ type: 'success', title: t('toast.agentDisabled') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.agentDisableError') });
    },
  });
}

export function useRegenerateAgentToken(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.agents.regenerateAgentToken({ params: { id: serverId }, body: {} });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKey(serverId) }).then();
      addToast({ type: 'success', title: t('toast.agentTokenRegenerated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.agentTokenRegenerateError') });
    },
  });
}

export function useInstallAgent(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (platform: AgentPlatform) => {
      const result = await apiClient.agents.installAgent({ params: { id: serverId }, body: { platform } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKey(serverId) }).then();
      addToast({ type: 'success', title: t('toast.agentInstalled'), description: t('agent.restartRequired') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.agentInstallError') });
    },
  });
}

export function useUpdateAgent(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (platform: AgentPlatform) => {
      const result = await apiClient.agents.updateAgent({ params: { id: serverId }, body: { platform } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKey(serverId) }).then();
      addToast({ type: 'success', title: t('toast.agentUpdated'), description: t('agent.restartRequired') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.agentUpdateError') });
    },
  });
}
