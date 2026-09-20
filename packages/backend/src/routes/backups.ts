import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import os from 'os';
import { eq } from 'drizzle-orm';
import { ErrorCodes, hasPermission as checkPermission } from '@shulkr/shared';
import { backupMetadata } from '@shulkr/backend/db/schema';
import { getBackupPath } from '@shulkr/backend/services/backup_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { getAllServers } from '@shulkr/backend/services/server_service';
import { downloadFromCloud } from '@shulkr/backend/services/cloud_backup_strategy';
import { resolveActiveShareLink, recordDownload } from '@shulkr/backend/services/backup_share_service';
import { getAppDeps } from '@shulkr/backend/deps';

// Strips characters that could break out of the Content-Disposition header value.
function sanitizeForHeader(name: string): string {
  return name.replace(/[\r\n"]/g, '_');
}

export async function backupRoutes(fastify: FastifyInstance) {
  // GET /api/servers/backups/:filename Auth via ?token= query parameter so the browser can open the URL directly
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
      let backupPath = await getBackupPath(getAppDeps(), filename);
      let isTemporary = false;

      if (!backupPath) {
        const [meta] = await getAppDeps().db.select().from(backupMetadata).where(eq(backupMetadata.filename, filename)).limit(1);

        if (meta && meta.cloud_key && meta.cloud_destination_id) {
          const tempDir = path.join(os.tmpdir(), 'shulkr-cloud-restore');
          await getAppDeps().fs.mkdir(tempDir, { recursive: true });
          backupPath = path.join(tempDir, filename);
          await downloadFromCloud(meta, backupPath);
          isTemporary = true;
        }
      }

      if (!backupPath) {
        return reply.code(404).send({ error: 'Backup not found' });
      }

      const fs = getAppDeps().fs;
      const stats = await fs.stat(backupPath);
      const basename = path.basename(backupPath);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${basename}"`);
      reply.header('Content-Length', stats.size);
      // Send the stream immediately: audit log is fire-and-forget
      const stream = fs.createReadStream(backupPath);

      if (isTemporary) {
        const tempPath = backupPath;

        stream.on('close', () => {
          void fs.unlink(tempPath).catch(() => {});
        });
      }

      const slugMatch = filename.match(/^([a-z0-9-]+?)-(?:manual|auto)/);

      if (slugMatch) {
        getAllServers(getAppDeps()).then((allServers) => {
          const slug = slugMatch[1];

          const serverId = allServers.find((s: { name: string; id: string }) => {
            const serverSlug = s.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');

            return serverSlug === slug;
          })?.id;

          logAuditAction(getAppDeps(), {
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
        logAuditAction(getAppDeps(), {
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

export async function publicBackupRoutes(fastify: FastifyInstance) {
  // GET /share/:token Unauthenticated. The token is the only input: it maps to a DB row that holds the internal filename, so no path traversal or enumeration is possible. Every invalid case returns the same generic 404 to avoid an oracle.
  fastify.get(
    '/:token',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const deps = getAppDeps();
      const link = await resolveActiveShareLink(deps, request.params.token);

      if (!link) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const backupPath = await getBackupPath(deps, link.filename);

      if (!backupPath) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const stats = await deps.fs.stat(backupPath);
      const basename = path.basename(backupPath);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${sanitizeForHeader(basename)}"`);
      reply.header('Content-Length', stats.size);

      await recordDownload(deps, link.id, request.ip);

      await logAuditAction(deps, {
        userId: null,
        username: null,
        action: 'public_download_backup',
        resourceType: 'backup',
        resourceId: link.server_id ?? undefined,
        details: { filename: link.filename, shareLinkId: link.id },
        ip: request.ip,
      });

      const stream = deps.fs.createReadStream(backupPath);

      return reply.send(stream);
    }
  );
}
