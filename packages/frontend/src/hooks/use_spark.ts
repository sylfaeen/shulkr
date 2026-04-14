import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useSparkStatus(serverId: string) {
  return useQuery({
    queryKey: ['spark', serverId, 'status'],
    queryFn: async () => {
      const result = await apiClient.spark.status({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useSparkHealth(serverId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['spark', serverId, 'health'],
    queryFn: async () => {
      const result = await apiClient.spark.health({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useStartProfiler(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.spark.startProfiler({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      addToast({
        type: data.success ? 'success' : 'error',
        title: data.success ? t('toast.sparkProfilerStarted') : (data.error ?? t('toast.sparkProfilerFailed')),
      });
    },
  });
}

export function useStopProfiler(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.spark.stopProfiler({ params: { serverId } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      if (data.url) {
        addToast({ type: 'success', title: t('toast.sparkProfilerStopped') });
      } else {
        addToast({ type: 'success', title: t('toast.sparkProfilerStoppedNoUrl') });
      }
    },
  });
}
