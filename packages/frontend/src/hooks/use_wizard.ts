import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type { CreateFirstServerInput } from '@shulkr/shared';

export function useWizardPresets() {
  return useQuery({
    queryKey: ['wizard', 'presets'],
    queryFn: async () => {
      const result = await apiClient.wizard.getPresets();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useCreateFirstServer() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateFirstServerInput) => {
      const result = await apiClient.wizard.createFirstServer({ body });
      if (result.status !== 201) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] }).then();
      addToast({ type: 'success', title: t('wizard.firstServer.toast.created') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('wizard.firstServer.toast.failed') });
    },
  });
}

const SKIP_KEY_PREFIX = 'shulkr_wizard_first_server_skipped';

export function isWizardSkipped(userId: number | string): boolean {
  if (typeof window === 'undefined') return false;
  // Clean up legacy localStorage flag left over from earlier versions that used cross-session persistence
  if (localStorage.getItem(`${SKIP_KEY_PREFIX}_${userId}`) !== null) {
    localStorage.removeItem(`${SKIP_KEY_PREFIX}_${userId}`);
  }
  return sessionStorage.getItem(`${SKIP_KEY_PREFIX}_${userId}`) === 'true';
}

export function markWizardSkipped(userId: number | string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`${SKIP_KEY_PREFIX}_${userId}`, 'true');
  // Clear any legacy localStorage flag from previous versions
  localStorage.removeItem(`${SKIP_KEY_PREFIX}_${userId}`);
}

export function clearWizardSkipped(userId: number | string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${SKIP_KEY_PREFIX}_${userId}`);
  localStorage.removeItem(`${SKIP_KEY_PREFIX}_${userId}`);
}
