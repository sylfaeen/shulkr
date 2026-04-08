import { eq } from 'drizzle-orm';
import { ErrorCodes, type Permission } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { users } from '@shulkr/backend/db/schema';
import type { FastifyRequest } from 'fastify';

interface JWTUser {
  sub: number;
  username: string;
  permissions: Array<string>;
  token_version: number;
}

type MiddlewareError =
  | { status: 401; body: { code: string; message: string } }
  | { status: 403; body: { code: string; message: string } }
  | { status: 429; body: { code: string; message: string } };

export type { JWTUser, MiddlewareError };

export async function authenticate(request: FastifyRequest): Promise<JWTUser> {
  try {
    await request.jwtVerify();
  } catch {
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: ErrorCodes.AUTH_UNAUTHORIZED } };
  }

  const user = request.user as JWTUser;
  const [dbUser] = await db.select({ token_version: users.token_version }).from(users).where(eq(users.id, user.sub)).limit(1);

  if (!dbUser || dbUser.token_version !== user.token_version)
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: ErrorCodes.AUTH_TOKEN_INVALID } };

  return user;
}

export function assertPermissions(user: JWTUser, ...permissions: Array<Permission>): void {
  const hasAccess = permissions.every((p) => user.permissions.includes('*') || user.permissions.includes(p));
  if (!hasAccess) throw { status: 403 as const, body: { code: ErrorCodes.AUTH_FORBIDDEN, message: ErrorCodes.AUTH_FORBIDDEN } };
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, INTERVAL);

export function checkRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && now < entry.resetAt) {
    if (entry.count >= max)
      throw { status: 429 as const, body: { code: ErrorCodes.RATE_LIMITED, message: ErrorCodes.RATE_LIMITED } };
    entry.count++;
  } else {
    store.set(key, { count: 1, resetAt: now + windowMs });
  }
}

export function isMiddlewareError(error: unknown): error is MiddlewareError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'body' in error &&
    typeof (error as MiddlewareError).status === 'number'
  );
}
