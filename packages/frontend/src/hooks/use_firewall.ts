import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import type { FirewallProtocol } from '@shulkr/shared';

export function useFirewallRules() {
  return useQuery({
    queryKey: ['firewall', 'list'],
    queryFn: async () => {
      const result = await apiClient.firewall.list();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useAddFirewallRule() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { port: number; protocol: FirewallProtocol; label: string }) => {
      const result = await apiClient.firewall.add({ body: input });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.firewallRuleAdded') });
    },
    onError: (error) => {
      addToast({ type: 'error', title: t('toast.firewallRuleAddError'), description: error.message });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: { port: number; protocol: FirewallProtocol; label: string }) => mutation.mutateAsync(input),
  };
}

export function useRemoveFirewallRule() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ ruleId }: { ruleId: number }) => {
      const result = await apiClient.firewall.remove({ params: { ruleId: String(ruleId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewall', 'list'] }).then();
      addToast({ type: 'success', title: t('toast.firewallRuleRemoved') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.firewallRuleRemoveError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (ruleId: number) => mutation.mutateAsync({ ruleId }),
  };
}

export function useToggleFirewallRule() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['firewall', 'list'];

  type FirewallRule = { id: number; enabled: boolean; [key: string]: unknown };

  const mutation = useMutation({
    mutationFn: async ({ ruleId }: { ruleId: number }) => {
      const result = await apiClient.firewall.toggle({ params: { ruleId: String(ruleId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onMutate: async ({ ruleId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<FirewallRule>>(queryKey);
      if (previous) {
        queryClient.setQueryData<Array<FirewallRule>>(
          queryKey,
          previous.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
        );
      }
      return { previous };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.firewallRuleToggled') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.firewallRuleToggleError') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
  });

  return {
    ...mutation,
    mutateAsync: (ruleId: number) => mutation.mutateAsync({ ruleId }),
  };
}
