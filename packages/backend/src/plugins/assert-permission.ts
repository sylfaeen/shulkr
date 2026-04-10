import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes, hasPermission } from '@shulkr/shared';

interface JWTUser {
  sub: number;
  username: string;
  permissions: Array<string>;
  token_version: number;
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorate('assertPermission', function (request: FastifyRequest, reply: FastifyReply, permission: string) {
    const user = request.user as JWTUser | undefined;

    if (!user) {
      reply.status(401).send({
        success: false,
        error: { code: ErrorCodes.AUTH_UNAUTHORIZED, message: 'Authentication required' },
      });
      return false;
    }

    if (!hasPermission(user.permissions, permission)) {
      reply.status(403).send({
        success: false,
        error: { code: ErrorCodes.AUTH_FORBIDDEN, message: 'Insufficient permissions' },
      });
      return false;
    }

    return true;
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    assertPermission: (request: FastifyRequest, reply: FastifyReply, permission: string) => boolean;
  }
}
