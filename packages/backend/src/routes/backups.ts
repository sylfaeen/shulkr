import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { backupService } from '@shulkr/backend/services/backup_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { ServerService } from '@shulkr/backend/services/server_service';

const serverService = new ServerService();

export async function backupRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /api/servers/backups/:filename
  fastify.get<{ Params: { filename: string } }>(
    '/backups/:filename',
    { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!fastify.assertPermission(request, reply, 'server:backups:download')) return;

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
      const slugMatch = filename.match(/^([a-z0-9-]+?)-(?:manual|auto)/);
      let serverId: string | undefined;
      if (slugMatch) {
        const allServers = await serverService.getAllServers();
        const slug = slugMatch[1];
        serverId = allServers.find((s: { name: string; id: string }) => {
          const serverSlug = s.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          return serverSlug === slug;
        })?.id;
      }
      await auditService.log({
        userId: user?.sub ?? null,
        username: user?.username ?? null,
        action: 'download_backup',
        resourceType: 'backup',
        resourceId: serverId,
        details: { filename },
        ip: request.ip,
      });

      const stream = createReadStream(backupPath);
      return reply.send(stream);
    }
  );
}
