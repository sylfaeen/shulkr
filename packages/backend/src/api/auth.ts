import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { eq } from 'drizzle-orm';
import { users } from '@shulkr/backend/db/schema';
import {
  validateCredentials,
  generateAccessToken,
  generateTotpToken,
  verifyTotpToken,
  generateRefreshToken,
  createSession,
  invalidateSession,
  refresh as refreshSession,
} from '@shulkr/backend/services/auth_service';
import {
  isTotpEnabled,
  verifyTotpCode,
  verifyRecoveryCode,
  getRemainingRecoveryCodes,
} from '@shulkr/backend/services/totp_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { getUserById } from '@shulkr/backend/services/user_service';
import {
  rateLimitCheck,
  rateLimitCheckLoginLockout,
  rateLimitRecordLoginFailure,
  rateLimitClearLoginFailures,
} from '@shulkr/backend/services/rate_limit_service';
import { REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenCookieOptions } from '@shulkr/backend/plugins/cookie';
import { withAuthOnly } from '@shulkr/backend/api/_shared';
import { isMiddlewareError } from '@shulkr/backend/api/middleware';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();

const LOCKOUT_MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60_000;

export function createAuthRoutes(deps: AppDeps) {
  return s.router(contract.auth, {
    login: async ({ request, reply, body }) => {
      try {
        rateLimitCheckLoginLockout(deps, `lockout:${request.ip}`, LOCKOUT_MAX_ATTEMPTS, LOCKOUT_WINDOW_MS);
        rateLimitCheck(deps, `ip:${request.ip}:auth.login`, 5, 60_000);

        const { valid, user } = await validateCredentials(deps, body.username, body.password);

        if (!valid || !user) {
          rateLimitRecordLoginFailure(deps, `lockout:${request.ip}`, LOCKOUT_WINDOW_MS);

          await logAuditAction(deps, {
            userId: null,
            username: body.username,
            action: 'login_failed',
            resourceType: 'auth',
            ip: request.ip,
          });

          return {
            status: 401 as const,
            body: { code: ErrorCodes.AUTH_INVALID_CREDENTIALS, message: ErrorCodes.AUTH_INVALID_CREDENTIALS },
          };
        }

        const totpEnabled = await isTotpEnabled(deps, user.id);

        if (totpEnabled) {
          const totpToken = generateTotpToken(request.server.jwt, user.id);

          return { status: 200 as const, body: { requires_totp: true as const, totp_token: totpToken } };
        }

        rateLimitClearLoginFailures(deps, `lockout:${request.ip}`);
        const accessToken = generateAccessToken(request.server.jwt, user);
        const refreshToken = generateRefreshToken();
        await createSession(deps, user.id, refreshToken);
        const cookieOptions = getRefreshTokenCookieOptions(request);
        reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...cookieOptions, path: '/api' });

        await logAuditAction(deps, {
          userId: user.id,
          username: user.username,
          action: 'login',
          resourceType: 'auth',
          ip: request.ip,
        });

        return {
          status: 200 as const,
          body: {
            success: true as const,
            data: {
              access_token: accessToken,
              user: {
                id: user.id,
                username: user.username,
                permissions: JSON.parse(user.permissions) as Array<string>,
                locale: user.locale ?? null,
              },
            },
          },
        };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    verifyTotp: async ({ request, reply, body }) => {
      try {
        rateLimitCheck(deps, `ip:${request.ip}:auth.verifyTotp`, 5, 60_000);

        const { valid, userId } = verifyTotpToken(request.server.jwt, body.totp_token);

        if (!valid || !userId) {
          return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_EXPIRED, message: ErrorCodes.AUTH_TOKEN_EXPIRED } };
        }

        let codeValid = await verifyTotpCode(deps, userId, body.code);
        let usedRecoveryCode = false;

        if (!codeValid) {
          codeValid = await verifyRecoveryCode(deps, userId, body.code);
          usedRecoveryCode = codeValid;
        }

        if (!codeValid) {
          await logAuditAction(deps, {
            userId,
            username: null,
            action: 'totp_failed',
            resourceType: 'auth',
            ip: request.ip,
          });

          return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
        }

        const [user] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);

        if (!user) {
          return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: ErrorCodes.AUTH_TOKEN_INVALID } };
        }

        const accessToken = generateAccessToken(request.server.jwt, user);
        const refreshToken = generateRefreshToken();
        await createSession(deps, user.id, refreshToken);
        const cookieOptions = getRefreshTokenCookieOptions(request);
        reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...cookieOptions, path: '/api' });

        await logAuditAction(deps, {
          userId: user.id,
          username: user.username,
          action: usedRecoveryCode ? 'login_recovery_code' : 'login_totp',
          resourceType: 'auth',
          ip: request.ip,
        });

        return {
          status: 200 as const,
          body: {
            success: true as const,
            data: {
              access_token: accessToken,
              user: {
                id: user.id,
                username: user.username,
                permissions: JSON.parse(user.permissions) as Array<string>,
                locale: user.locale ?? null,
              },
            },
            recovery_codes_remaining: usedRecoveryCode ? await getRemainingRecoveryCodes(deps, userId) : undefined,
          },
        };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    logout: async ({ request, reply }) => {
      const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];

      if (refreshToken) {
        await invalidateSession(deps, refreshToken);
      }

      reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api' });

      let userId: number | null = null;
      let username: string | null = null;

      try {
        await request.jwtVerify();
        const user = request.user as { sub: number; username: string };
        userId = user.sub;
        username = user.username;
      } catch {}

      await logAuditAction(deps, {
        userId,
        username,
        action: 'logout',
        resourceType: 'auth',
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Logged out successfully' } };
    },

    refresh: async ({ request, reply }) => {
      try {
        const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];

        if (!refreshToken) {
          return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: ErrorCodes.AUTH_TOKEN_INVALID } };
        }

        const result = await refreshSession(deps, request.server.jwt, refreshToken);

        if (!result.success) {
          reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api' });

          return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_EXPIRED, message: ErrorCodes.AUTH_TOKEN_EXPIRED } };
        }

        const cookieOptions = getRefreshTokenCookieOptions(request);
        reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, result.newRefreshToken, { ...cookieOptions, path: '/api' });

        return {
          status: 200 as const,
          body: { success: true as const, data: result.data },
        };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    me: ({ request }) =>
      withAuthOnly(request, async (user) => {
        const dbUser = await getUserById(deps, user.sub);

        return {
          status: 200 as const,
          body: {
            id: user.sub,
            username: user.username,
            permissions: user.permissions,
            locale: dbUser?.locale ?? null,
            created_at: dbUser?.created_at ?? '',
            updated_at: dbUser?.updated_at ?? '',
          },
        };
      }),

    verifyPassword: ({ request, body }) =>
      withAuthOnly(request, async (user) => {
        rateLimitCheck(deps, `user:${user.sub}:verify-password`, 10, 60_000);
        const result = await validateCredentials(deps, user.username, body.password);

        if (!result.valid) {
          return {
            status: 403 as const,
            body: { code: ErrorCodes.AUTH_INVALID_PASSWORD, message: ErrorCodes.AUTH_INVALID_PASSWORD },
          };
        }

        return { status: 200 as const, body: { message: 'Password verified' } };
      }),
  });
}
