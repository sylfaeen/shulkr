import { useMutation } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useVerifyPassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const result = await apiClient.auth.verifyPassword({ body: { password } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}
