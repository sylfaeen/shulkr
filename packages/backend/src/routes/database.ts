import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { ErrorCodes, hasPermission as checkPermission } from '@shulkr/shared';
import { DATABASE_PATH } from '@shulkr/backend/db';

export async function databaseDownloadRoute(fastify: FastifyInstance) {
  fastify.get(
    '/database/download',
    async (
      request: FastifyRequest<{
        Querystring: { token: string };
      }>,
      reply: FastifyReply
    ) => {
      const token = request.query.token;
      if (!token) {
        return reply.status(401).send({
          success: false,
          error: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: 'Missing token' },
        });
      }
      let user: { sub: number; username: string; permissions: Array<string> };
      try {
        user = fastify.jwt.verify(token);
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: ErrorCodes.AUTH_TOKEN_INVALID, message: 'Invalid or expired token' },
        });
      }
      if (!checkPermission(user.permissions, 'settings:general:read')) {
        return reply.status(403).send({
          success: false,
          error: { code: ErrorCodes.AUTH_FORBIDDEN, message: 'Insufficient permissions' },
        });
      }
      const stat = statSync(DATABASE_PATH);
      const stream = createReadStream(DATABASE_PATH);
      return reply
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(DATABASE_PATH))}"`)
        .header('Content-Length', stat.size)
        .type('application/octet-stream')
        .send(stream);
    }
  );
}
