import bcrypt from 'bcrypt';
import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { users } from '@shulkr/backend/db/schema';
import { generateAccessToken, generateRefreshToken, createSession } from '@shulkr/backend/services/auth_service';
import { checkRateLimit } from '@shulkr/backend/services/rate_limit_service';
import { isMiddlewareError } from '@shulkr/backend/api/middleware';
import { REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenCookieOptions } from '@shulkr/backend/plugins/cookie';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();

const BCRYPT_ROUNDS = 12;

export function createOnboardingRoutes(deps: AppDeps) {
  return s.router(contract.onboarding, {
    needsSetup: async () => {
      const existingUsers = await deps.db.select().from(users).limit(1);
      return { status: 200 as const, body: { needsSetup: existingUsers.length === 0 } };
    },

    setup: async ({ request, reply, body }) => {
      try {
        checkRateLimit(`ip:${request.ip}:onboarding.setup`, 5, 60_000);

        const existingUsers = await deps.db.select().from(users).limit(1);
        if (existingUsers.length > 0) {
          throw {
            status: 200 as const,
            body: { code: ErrorCodes.SETUP_ALREADY_COMPLETED, message: ErrorCodes.SETUP_ALREADY_COMPLETED },
          };
        }

        const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

        const [newUser] = await deps.db
          .insert(users)
          .values({
            username: body.username,
            password_hash: passwordHash,
            permissions: JSON.stringify(['*']),
            locale: body.locale ?? null,
          })
          .returning();

        const accessToken = generateAccessToken(request.server.jwt, newUser);
        const refreshToken = generateRefreshToken();
        await createSession(deps, newUser.id, refreshToken);

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
}
