import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { backupService } from '@shulkr/backend/services/backup_service';
import { auditService } from '@shulkr/backend/services/audit_service';

export async function backupRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /api/servers/backups/:filename
  fastify.get<{ Params: { filename: string } }>(
    '/backups/:filename',
    { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!fastify.assertPermission(request, reply, 'server:backups')) return;

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

      const user = request.user as { sub: number; username: string } | undefined;
      await auditService.log({
        userId: user?.sub ?? null,
        username: user?.username ?? null,
        action: 'download_backup',
        resourceType: 'backup',
        details: { filename },
        ip: request.ip,
      });

      const stream = createReadStream(backupPath);
      return reply.send(stream);
    }
  );
}
