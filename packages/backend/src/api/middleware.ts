import { eq } from 'drizzle-orm';
import { ErrorCodes, hasAllPermissions, type PermissionId } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { users, serverAgents, type ServerAgentRow } from '@shulkr/backend/db/schema';
import { verifyTokenAgainstHash } from '@shulkr/backend/services/agent_token_service';
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

export function assertPermissions(user: JWTUser, ...permissions: Array<PermissionId>): void {
  if (!hasAllPermissions(user.permissions, ...permissions)) {
    throw { status: 403 as const, body: { code: ErrorCodes.AUTH_FORBIDDEN, message: ErrorCodes.AUTH_FORBIDDEN } };
  }
}

export { checkRateLimit } from '@shulkr/backend/services/rate_limit_service';

export async function authenticateAgent(request: FastifyRequest, serverId: string): Promise<ServerAgentRow> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: ErrorCodes.AUTH_UNAUTHORIZED } };
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: ErrorCodes.AUTH_UNAUTHORIZED } };
  }
  const [row] = await db.select().from(serverAgents).where(eq(serverAgents.server_id, serverId)).limit(1);
  if (!row) {
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: ErrorCodes.AUTH_UNAUTHORIZED } };
  }
  if (!verifyTokenAgainstHash(token, row.token_hash)) {
    throw { status: 401 as const, body: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: ErrorCodes.AUTH_UNAUTHORIZED } };
  }
  if (!row.enabled) {
    throw { status: 403 as const, body: { code: ErrorCodes.AUTH_FORBIDDEN, message: ErrorCodes.AUTH_FORBIDDEN } };
  }
  return row;
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
