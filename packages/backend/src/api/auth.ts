import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { AuthService } from '@shulkr/backend/services/auth_service';
import { totpService } from '@shulkr/backend/services/totp_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenCookieOptions } from '@shulkr/backend/plugins/cookie';
import { ErrorCodes } from '@shulkr/shared';
import { authenticate, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();

export const authRoutes = s.router(contract.auth, {
  login: async ({ request, reply, body }) => {
    try {
      checkRateLimit(`ip:${request.ip}:auth.login`, 5, 60_000);

      const authService = new AuthService(request.server);
      const { valid, user } = await authService.validateCredentials(body.username, body.password);

      if (!valid || !user) {
        await auditService.log({
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

      const totpEnabled = await totpService.isTotpEnabled(user.id);
      if (totpEnabled) {
        const totpToken = authService.generateTotpToken(user.id);
        return { status: 200 as const, body: { requires_totp: true as const, totp_token: totpToken } };
      }

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken();
      await authService.createSession(user.id, refreshToken);

      const cookieOptions = getRefreshTokenCookieOptions(request);
      reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...cookieOptions, path: '/api' });

      await auditService.log({
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
      checkRateLimit(`ip:${request.ip}:auth.verifyTotp`, 5, 60_000);

      const authService = new AuthService(request.server);
      const { valid, userId } = authService.verifyTotpToken(body.totp_token);

      if (!valid || !userId) {
        return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_EXPIRED, message: ErrorCodes.AUTH_TOKEN_EXPIRED } };
      }

      let codeValid = await totpService.verifyTotpCode(userId, body.code);
      let usedRecoveryCode = false;

      if (!codeValid) {
        codeValid = await totpService.verifyRecoveryCode(userId, body.code);
        usedRecoveryCode = codeValid;
      }

      if (!codeValid) {
        await auditService.log({
          userId,
          username: null,
          action: 'totp_failed',
          resourceType: 'auth',
          ip: request.ip,
        });
        return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
      }

      const { users } = await import('@shulkr/backend/db/schema');
      const { eq } = await import('drizzle-orm');
      const { db } = await import('@shulkr/backend/db');
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: ErrorCodes.AUTH_TOKEN_INVALID } };
      }

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken();
      await authService.createSession(user.id, refreshToken);

      const cookieOptions = getRefreshTokenCookieOptions(request);
      reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...cookieOptions, path: '/api' });

      await auditService.log({
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
          recovery_codes_remaining: usedRecoveryCode ? await totpService.getRemainingRecoveryCodes(userId) : undefined,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  logout: async ({ request, reply }) => {
    const authService = new AuthService(request.server);
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];

    if (refreshToken) {
      await authService.invalidateSession(refreshToken);
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

    await auditService.log({
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
      const authService = new AuthService(request.server);
      const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];

      if (!refreshToken) {
        return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: ErrorCodes.AUTH_TOKEN_INVALID } };
      }

      const result = await authService.refresh(refreshToken);

      if (!result.success) {
        reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/api' });
        return { status: 401 as const, body: { code: ErrorCodes.AUTH_TOKEN_EXPIRED, message: ErrorCodes.AUTH_TOKEN_EXPIRED } };
      }

      const cookieOptions = getRefreshTokenCookieOptions(request);
      reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, result.newRefreshToken, { ...cookieOptions, path: '/api' });

      return {
        status: 200 as const,
        body: {
          success: true as const,
          data: result.data,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  me: async ({ request }) => {
    try {
      const user = await authenticate(request);
      const userService = await import('@shulkr/backend/services/user_service');
      const service = new userService.UserService();
      const dbUser = await service.getUserById(user.sub);

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
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
