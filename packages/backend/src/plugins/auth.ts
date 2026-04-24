import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '@shulkr/shared';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES = '24h';

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: JWT_SECRET,
    sign: {
      expiresIn: ACCESS_TOKEN_EXPIRES,
    },
  });
  // Decorate request with user data after JWT verification
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.AUTH_TOKEN_INVALID,
          message: 'Invalid or expired token',
        },
      });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
