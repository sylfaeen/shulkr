import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { basename } from 'path';
import { ErrorCodes, hasPermission as checkPermission } from '@shulkr/shared';
import { DATABASE_PATH } from '@shulkr/backend/db';
import { getServerDatabase } from '@shulkr/backend/services/database_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { getAppDeps } from '@shulkr/backend/deps';

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

      const fs = getAppDeps().fs;
      const stat = await fs.stat(DATABASE_PATH);
      const stream = fs.createReadStream(DATABASE_PATH);

      return reply
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(basename(DATABASE_PATH))}"`)
        .header('Content-Length', stat.size)
        .type('application/octet-stream')
        .send(stream);
    }
  );
}

// Streams a mysqldump straight from the privileged script to the browser. The dump never touches the disk: a file owned by the shulkr user would be readable by every Minecraft server on the machine for as long as it existed, and a dump is the entire database in plaintext.
export async function serverDatabaseDownloadRoute(fastify: FastifyInstance) {
  fastify.get(
    '/databases/:id/download',
    async (
      request: FastifyRequest<{
        Params: { id: string };
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

      if (!checkPermission(user.permissions, 'server:databases:browse')) {
        return reply.status(403).send({
          success: false,
          error: { code: ErrorCodes.AUTH_FORBIDDEN, message: 'Insufficient permissions' },
        });
      }

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, Number(request.params.id));

      if (!row) {
        return reply.status(404).send({
          success: false,
          error: { code: ErrorCodes.DATABASE_NOT_FOUND, message: 'Database not found' },
        });
      }

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'download',
        resourceType: 'server_database',
        resourceId: row.server_id,
        details: { database: row.db_name },
        ip: request.ip,
      });

      const handle = deps.shell.spawn(deps.config.DATABASE_SCRIPT_PATH, ['stream-dump', row.db_name], { sudo: true });

      if (!handle.stdout) {
        return reply.status(503).send({
          success: false,
          error: { code: ErrorCodes.DATABASE_DUMP_FAILED, message: 'Could not start the dump' },
        });
      }

      return reply
        .header('Content-Disposition', `attachment; filename="${row.db_name}.sql.gz"`)
        .type('application/gzip')
        .send(handle.stdout);
    }
  );
}
