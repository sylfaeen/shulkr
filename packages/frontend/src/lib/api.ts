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

// For requests outside the ts-rest contract (binary bodies). Same token handling as apiClient: one silent refresh and retry on 401, since a long chunked upload outlives the access token.
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const response = await send(useAuthStore.getState().accessToken);
  if (response.status !== 401) return response;

  const newToken = await refreshAccessToken();

  if (!newToken) {
    useAuthStore.getState().clearAuth();

    return response;
  }

  return send(newToken);
}

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
