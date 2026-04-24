import { initClient, tsRestFetchApi } from '@ts-rest/core';
import { contract } from '@shulkr/shared';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

let refreshPromise: Promise<string | null> | null = null;

const AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/verify-totp']);

async function silentRefresh(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    const body = await response.json();
    const { access_token, user } = body.data;
    useAuthStore.getState().setAuth(user, access_token);
    return access_token;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = silentRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function buildHeaders(args: { headers?: Record<string, string> }, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (args.headers) {
    for (const [key, value] of Object.entries(args.headers)) {
      headers[key] = value;
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const apiClient = initClient(contract, {
  baseUrl: '',
  baseHeaders: {},
  credentials: 'include',
  api: async (args) => {
    const token = useAuthStore.getState().accessToken;
    const headers = buildHeaders(args, token);
    const response = await tsRestFetchApi({ ...args, headers });
    if (response.status === 401 && !AUTH_PATHS.has(args.path)) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = buildHeaders(args, newToken);
        return tsRestFetchApi({ ...args, headers: retryHeaders });
      }
      useAuthStore.getState().clearAuth();
    }
    return response;
  },
});

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function raise(body: unknown, status: number): never {
  const b = body as { code?: string; message?: string } | null;
  throw new ApiError(b?.message ?? 'An error occurred', b?.code ?? 'UNKNOWN', status);
}
