import type { FastifyRequest } from 'fastify';
import type { PermissionId } from '@shulkr/shared';
import {
  authenticate,
  assertPermissions,
  isMiddlewareError,
  type JWTUser,
  type MiddlewareError,
} from '@shulkr/backend/api/middleware';

/**
 * Wraps a ts-rest handler with authentication + permission check, and
 * collapses the standard try/catch boilerplate into the helper. The handler
 * receives the authenticated user and returns the success response; on auth
 * failure the helper returns the corresponding 401/403 MiddlewareError.
 *
 * Replaces this duplicated pattern across every route:
 *
 *   try {
 *     const user = await authenticate(request);
 *     assertPermissions(user, '...');
 *     // logic
 *     return { status: 200 as const, body: data };
 *   } catch (error: unknown) {
 *     if (isMiddlewareError(error)) return error;
 *     throw error;
 *   }
 */
export async function withAuth<T extends { status: number; body: unknown }>(
  request: FastifyRequest,
  permission: PermissionId,
  handler: (user: JWTUser) => T | Promise<T>
): Promise<T | MiddlewareError> {
  try {
    const user = await authenticate(request);
    assertPermissions(user, permission);
    return await handler(user);
  } catch (error) {
    if (isMiddlewareError(error)) return error;
    throw error;
  }
}

/**
 * Same as withAuth() but skips the permission check. Use for routes that are
 * scoped to the requesting user themselves (own profile, own TOTP setup, …)
 * and where any authenticated user is allowed regardless of permissions.
 */
export async function withAuthOnly<T extends { status: number; body: unknown }>(
  request: FastifyRequest,
  handler: (user: JWTUser) => T | Promise<T>
): Promise<T | MiddlewareError> {
  try {
    const user = await authenticate(request);
    return await handler(user);
  } catch (error) {
    if (isMiddlewareError(error)) return error;
    throw error;
  }
}
