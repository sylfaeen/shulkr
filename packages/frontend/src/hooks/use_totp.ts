import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useTotpStatus() {
  return useQuery({
    queryKey: ['totp', 'status'],
    queryFn: async () => {
      const result = await apiClient.totp.status();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useTotpSetup() {
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.totp.setup();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useTotpVerify() {
  return useMutation({
    mutationFn: async (input: { code: string }) => {
      const result = await apiClient.totp.verify({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useTotpDisable() {
  return useMutation({
    mutationFn: async (input: { code: string }) => {
      const result = await apiClient.totp.disable({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}

export function useVerifyTotpLogin() {
  return useMutation({
    mutationFn: async (input: { totp_token: string; code: string }) => {
      const result = await apiClient.auth.verifyTotp({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
}
