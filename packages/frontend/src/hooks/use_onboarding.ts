import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export function useNeedsSetup() {
  return useQuery({
    queryKey: ['onboarding', 'needsSetup'],
    queryFn: async () => {
      const result = await apiClient.onboarding.needsSetup();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useSetup() {
  const { i18n } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async (input: { username: string; password: string; locale?: string }) => {
      const result = await apiClient.onboarding.setup({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.access_token);
      if (data.user.locale) {
        i18n.changeLanguage(data.user.locale).then();
      }
    },
  });
}
