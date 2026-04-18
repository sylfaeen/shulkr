import { useCallback } from 'react';
import { hasAnyPermission, hasGroupAccess, type PermissionId } from '@shulkr/shared';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export function useHasPermission() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  return useCallback((...required: Array<PermissionId>) => hasAnyPermission(permissions, ...required), [permissions]);
}

export function useHasGroupAccess() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  return useCallback((...groups: Array<PermissionId>) => hasGroupAccess(permissions, ...groups), [permissions]);
}
