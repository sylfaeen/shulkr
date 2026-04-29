import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ErrorCodes } from '@shulkr/shared';
import { apiClient, ApiError } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

type LoginSuccessData = {
  success: true;
  data: {
    access_token: string;
    user: { id: number; username: string; permissions: Array<string>; locale: string | null };
  };
};

type LoginTotpData = {
  requires_totp: true;
  totp_token: string;
};

export function useLogin(onTotpRequired?: (totpToken: string) => void) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);
  return useMutation({
    mutationFn: async (input: { username: string; password: string }) => {
      const result = await apiClient.auth.login({ body: input });
      if (result.status !== 200) {
        const error = result.body as { message: string; code: string };
        throw new ApiError(error.message, error.code, result.status);
      }
      return result.body as LoginSuccessData | LoginTotpData;
    },
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: (data) => {
      if ('requires_totp' in data && data.requires_totp) {
        setLoading(false);
        onTotpRequired?.(data.totp_token);
        return;
      }
      if ('success' in data && data.success) {
        setAuth(data.data.user, data.data.access_token);
        if (data.data.user.locale) {
          i18n.changeLanguage(data.data.user.locale).then();
        }
        navigate({ to: '/app' }).then();
      }
    },
    onError: () => {
      setLoading(false);
    },
  });
}

export function useVerifyTotpLogin() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  return useMutation({
    mutationFn: async (input: { totp_token: string; code: string }) => {
      const result = await apiClient.auth.verifyTotp({ body: input });
      if (result.status !== 200) {
        const error = result.body as { message: string; code: string };
        throw new ApiError(error.message, error.code, result.status);
      }
      return result.body;
    },
    onSuccess: (data) => {
      if ('success' in data && data.success) {
        setAuth(data.data.user, data.data.access_token);
        if (data.data.user.locale) {
          i18n.changeLanguage(data.data.user.locale).then();
        }
        navigate({ to: '/app' }).then();
      }
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.auth.logout();
      if (result.status !== 200) throw new Error('Logout failed');
      return result.body;
    },
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
      navigate({ to: '/' }).then();
    },
    onError: () => {
      clearAuth();
      queryClient.clear();
      navigate({ to: '/' }).then();
    },
  });
}

export function useRefreshToken() {
  const { i18n } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  return useMutation({
    mutationFn: async () => {
      const result = await apiClient.auth.refresh();
      if (result.status !== 200) {
        const error = result.body as { message: string; code: string };
        throw new ApiError(error.message, error.code, result.status);
      }
      return result.body;
    },
    onSuccess: (data) => {
      setAuth(data.data.user, data.data.access_token);
      if (data.data.user.locale) {
        i18n.changeLanguage(data.data.user.locale).then();
      }
      setInitialized(true);
    },
    onError: () => {
      clearAuth();
      setInitialized(true);
    },
  });
}

export function useUser() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const result = await apiClient.auth.me();
      if (result.status !== 200) throw new Error('Failed to fetch user');
      return result.body;
    },
    enabled: isAuthenticated && !!accessToken,
    staleTime: 5 * 60 * 1000,
  });
}

export function getAuthErrorMessage(error: Error | null, t: TFunction): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    const message = error.message;
    switch (message) {
      case ErrorCodes.AUTH_INVALID_CREDENTIALS:
        return t('authErrors.invalidCredentials');
      case ErrorCodes.AUTH_TOKEN_EXPIRED:
        return t('authErrors.tokenExpired');
      case ErrorCodes.AUTH_TOKEN_INVALID:
        return t('authErrors.tokenInvalid');
      case ErrorCodes.AUTH_UNAUTHORIZED:
        return t('authErrors.unauthorized');
      case ErrorCodes.TOTP_INVALID_CODE:
        return t('authErrors.totpInvalidCode');
      case ErrorCodes.TOTP_ALREADY_ENABLED:
        return t('authErrors.totpAlreadyEnabled');
      case ErrorCodes.TOTP_NOT_ENABLED:
        return t('authErrors.totpNotEnabled');
      default:
        break;
    }
    const code = error.code;
    switch (code) {
      case 'BAD_REQUEST':
        return t('authErrors.badRequest');
      case 'TOO_MANY_REQUESTS':
        return t('authErrors.tooManyRequests');
      default:
        return t('authErrors.generic');
    }
  }
  return t('authErrors.generic');
}
