import bcrypt from 'bcrypt';
import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { users } from '@shulkr/backend/db/schema';
import { AuthService } from '@shulkr/backend/services/auth_service';
import { REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenCookieOptions } from '@shulkr/backend/plugins/cookie';
import { checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

const BCRYPT_ROUNDS = 12;

async function assertNeedsSetup(): Promise<void> {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0)
    throw { status: 200, body: { code: ErrorCodes.SETUP_ALREADY_COMPLETED, message: ErrorCodes.SETUP_ALREADY_COMPLETED } };
}

export const onboardingRoutes = s.router(contract.onboarding, {
  needsSetup: async () => {
    const existingUsers = await db.select().from(users).limit(1);
    return { status: 200 as const, body: { needsSetup: existingUsers.length === 0 } };
  },

  setup: async ({ request, reply, body }) => {
    try {
      checkRateLimit(`ip:${request.ip}:onboarding.setup`, 5, 60_000);
      await assertNeedsSetup();

      const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

      const [newUser] = await db
        .insert(users)
        .values({
          username: body.username,
          password_hash: passwordHash,
          permissions: JSON.stringify(['*']),
          locale: body.locale ?? null,
        })
        .returning();

      const authService = new AuthService(request.server);
      const accessToken = authService.generateAccessToken(newUser);
      const refreshToken = authService.generateRefreshToken();
      await authService.createSession(newUser.id, refreshToken);

      const cookieOptions = getRefreshTokenCookieOptions(request);
      reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...cookieOptions, path: '/api' });

      return {
        status: 200 as const,
        body: {
          access_token: accessToken,
          user: {
            id: newUser.id,
            username: newUser.username,
            permissions: JSON.parse(newUser.permissions) as Array<string>,
            locale: newUser.locale ?? null,
          },
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
