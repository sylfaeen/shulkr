import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const COOKIE_SECRET = process.env.COOKIE_SECRET!;

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(cookie, {
    secret: COOKIE_SECRET,
    parseOptions: {},
  });
});

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export function getRefreshTokenCookieOptions(req: FastifyRequest) {
  return {
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: 'lax' as const,
    path: '/api',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}
