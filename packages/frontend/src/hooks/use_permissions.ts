import { useCallback } from 'react';
import { hasAnyPermission } from '@shulkr/shared';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export function useHasPermission() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);

  return useCallback((...required: Array<string>) => hasAnyPermission(permissions, ...required), [permissions]);
}
