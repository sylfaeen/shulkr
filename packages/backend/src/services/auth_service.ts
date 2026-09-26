import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { users, sessions } from '@shulkr/backend/db/schema';
import type { FastifyInstance } from 'fastify';
import { type AppDeps } from '@shulkr/backend/deps';

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const TOTP_TOKEN_EXPIRES_SECONDS = 300;

interface TokenPayload {
  sub: number;
  username: string;
  permissions: Array<string>;
  token_version: number;
}

interface TotpTokenPayload {
  sub: number;
  purpose: 'totp_verification';
}

export interface AuthResult {
  access_token: string;
  user: {
    id: number;
    username: string;
    permissions: Array<string>;
    locale: string | null;
  };
}

type Deps = Pick<AppDeps, 'db' | 'clock'>;
type Jwt = FastifyInstance['jwt'];

export async function validateCredentials(
  deps: Deps,
  username: string,
  password: string
): Promise<{ valid: boolean; user?: typeof users.$inferSelect }> {
  const [user] = await deps.db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) return { valid: false };
  const valid = await bcrypt.compare(password, user.password_hash);

  return { valid, user: valid ? user : undefined };
}

export function generateAccessToken(jwt: Jwt, user: typeof users.$inferSelect): string {
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    permissions: JSON.parse(user.permissions) as Array<string>,
    token_version: user.token_version,
  };

  return jwt.sign(payload);
}

export function generateTotpToken(jwt: Jwt, userId: number): string {
  const payload: TotpTokenPayload = { sub: userId, purpose: 'totp_verification' };

  return jwt.sign(payload, { expiresIn: TOTP_TOKEN_EXPIRES_SECONDS });
}

export function verifyTotpToken(jwt: Jwt, token: string): { valid: boolean; userId?: number } {
  try {
    const decoded = jwt.verify<TotpTokenPayload>(token);
    if (decoded.purpose !== 'totp_verification') return { valid: false };

    return { valid: true, userId: decoded.sub };
  } catch {
    return { valid: false };
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export async function createSession(deps: Deps, userId: number, refreshToken: string): Promise<void> {
  const expiresAt = new Date(deps.clock().getTime() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await deps.db.insert(sessions).values({
    user_id: userId,
    refresh_token: refreshToken,
    expires_at: expiresAt.toISOString(),
  });
}

export async function validateRefreshToken(
  deps: Deps,
  refreshToken: string
): Promise<{ valid: boolean; user?: typeof users.$inferSelect }> {
  const [session] = await deps.db.select().from(sessions).where(eq(sessions.refresh_token, refreshToken)).limit(1);
  if (!session) return { valid: false };

  if (new Date(session.expires_at) < deps.clock()) {
    await invalidateSession(deps, refreshToken);

    return { valid: false };
  }

  const [user] = await deps.db.select().from(users).where(eq(users.id, session.user_id)).limit(1);
  if (!user) return { valid: false };

  return { valid: true, user };
}

export async function invalidateSession(deps: Deps, refreshToken: string): Promise<void> {
  await deps.db.delete(sessions).where(eq(sessions.refresh_token, refreshToken));
}

export async function invalidateAllUserSessions(deps: Deps, userId: number): Promise<void> {
  await deps.db.delete(sessions).where(eq(sessions.user_id, userId));
}

export async function login(
  deps: Deps,
  jwt: Jwt,
  username: string,
  password: string
): Promise<{ success: true; data: AuthResult; refreshToken: string } | { success: false }> {
  const { valid, user } = await validateCredentials(deps, username, password);
  if (!valid || !user) return { success: false };

  const accessToken = generateAccessToken(jwt, user);
  const refreshToken = generateRefreshToken();
  await createSession(deps, user.id, refreshToken);

  return {
    success: true,
    data: {
      access_token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        permissions: JSON.parse(user.permissions) as Array<string>,
        locale: user.locale ?? null,
      },
    },
    refreshToken,
  };
}

export async function refresh(
  deps: Deps,
  jwt: Jwt,
  refreshToken: string
): Promise<{ success: true; data: AuthResult; newRefreshToken: string } | { success: false }> {
  const { valid, user } = await validateRefreshToken(deps, refreshToken);
  if (!valid || !user) return { success: false };

  await invalidateSession(deps, refreshToken);
  const accessToken = generateAccessToken(jwt, user);
  const newRefreshToken = generateRefreshToken();
  await createSession(deps, user.id, newRefreshToken);

  return {
    success: true,
    data: {
      access_token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        permissions: JSON.parse(user.permissions) as Array<string>,
        locale: user.locale ?? null,
      },
    },
    newRefreshToken,
  };
}
