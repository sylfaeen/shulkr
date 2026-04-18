import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { ErrorCodes, hasPermission as checkPermission } from '@shulkr/shared';
import { backupService } from '@shulkr/backend/services/backup_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { serverService } from '@shulkr/backend/services/server_service';

export async function backupRoutes(fastify: FastifyInstance) {
  // GET /api/servers/backups/:filename
  // Auth via ?token= query parameter so the browser can open the URL directly
  fastify.get(
    '/backups/:filename',
    { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } },
    async (
      request: FastifyRequest<{
        Params: { filename: string };
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

      if (!checkPermission(user.permissions, 'server:backups:download')) {
        return reply.status(403).send({
          success: false,
          error: { code: ErrorCodes.AUTH_FORBIDDEN, message: 'Insufficient permissions' },
        });
      }

      const { filename } = request.params;

      const backupPath = backupService.getBackupPath(filename);
      if (!backupPath) {
        return reply.code(404).send({ error: 'Backup not found' });
      }

      const stats = await stat(backupPath);
      const basename = path.basename(backupPath);

      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${basename}"`);
      reply.header('Content-Length', stats.size);

      // Send the stream immediately: audit log is fire-and-forget
      const stream = createReadStream(backupPath);

      const slugMatch = filename.match(/^([a-z0-9-]+?)-(?:manual|auto)/);
      if (slugMatch) {
        serverService.getAllServers().then((allServers) => {
          const slug = slugMatch[1];
          const serverId = allServers.find((s: { name: string; id: string }) => {
            const serverSlug = s.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
            return serverSlug === slug;
          })?.id;

          auditService.log({
            userId: user.sub,
            username: user.username,
            action: 'download_backup',
            resourceType: 'backup',
            resourceId: serverId,
            details: { filename },
            ip: request.ip,
          });
        });
      } else {
        auditService.log({
          userId: user.sub,
          username: user.username,
          action: 'download_backup',
          resourceType: 'backup',
          details: { filename },
          ip: request.ip,
        });
      }

      return reply.send(stream);
    }
  );
}
