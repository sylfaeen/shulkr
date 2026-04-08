import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useExportConfig(serverId: string) {
  return useMutation({
    mutationFn: async (description?: string) => {
      const result = await apiClient.serverConfig.export({
        params: { serverId },
        body: { description },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useImportConfig(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: unknown) => {
      const result = await apiClient.serverConfig.import({
        params: { serverId },
        body: config,
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] }).then();
      addToast({ type: 'success', title: t('config.importSuccess') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('config.importError') });
    },
  });
}
