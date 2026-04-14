import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { ErrorCodes, hasPermission as checkPermission } from '@shulkr/shared';
import { fileService } from '@shulkr/backend/services/file_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';

const serverService = new ServerService();

export async function fileDownloadRoute(fastify: FastifyInstance) {
  // GET /api/servers/:serverId/files/download - Download a single file
  // Auth via ?token= query parameter so the browser can open the URL directly
  fastify.get(
    '/:serverId/files/download',
    async (
      request: FastifyRequest<{
        Params: { serverId: string };
        Querystring: { path: string; token: string };
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

      if (!checkPermission(user.permissions, 'server:files:read:download')) {
        return reply.status(403).send({
          success: false,
          error: { code: ErrorCodes.AUTH_FORBIDDEN, message: 'Insufficient permissions' },
        });
      }

      const serverId = request.params.serverId;

      if (!serverId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid server ID',
          },
        });
      }

      const server = await serverService.getServerById(serverId);
      if (!server) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.SERVER_NOT_FOUND,
            message: 'Server not found',
          },
        });
      }

      const filePath = request.query.path;
      if (!filePath) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Missing file path',
          },
        });
      }

      const result = fileService.resolveFilePath(server.path, filePath);

      if (!result.success) {
        const status = result.error === ErrorCodes.FILE_NOT_FOUND ? 404 : 400;
        return reply.status(status).send({
          success: false,
          error: {
            code: result.error,
            message: result.error,
          },
        });
      }

      const stream = createReadStream(result.fullPath);

      return reply
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.basename)}"`)
        .header('Content-Length', result.size)
        .type('application/octet-stream')
        .send(stream);
    }
  );
}

export async function fileRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /api/servers/:serverId/files/upload - Upload file (multipart/form-data)
  fastify.post(
    '/:serverId/files/upload',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (
      request: FastifyRequest<{
        Params: { serverId: string };
        Querystring: { path?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!fastify.assertPermission(request, reply, 'server:files:write')) return;

      const serverId = request.params.serverId;

      if (!serverId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid server ID',
          },
        });
      }

      const server = await serverService.getServerById(serverId);
      if (!server) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.SERVER_NOT_FOUND,
            message: 'Server not found',
          },
        });
      }

      const targetDir = request.query.path || '/';

      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: 'No file uploaded',
            },
          });
        }

        const buffer = await data.toBuffer();
        let filename = data.filename;

        // Add -custom suffix to JAR files uploaded to root (manual imports)
        if (targetDir === '/' && filename.endsWith('.jar')) {
          filename = filename.replace(/\.jar$/, '-custom.jar');
        }

        const filePath = targetDir === '/' ? `/${filename}` : `${targetDir}/${filename}`;

        const result = await fileService.uploadFile(server.path, filePath, buffer);

        if (!result.success) {
          return reply.status(500).send({
            success: false,
            error: {
              code: ErrorCodes.INTERNAL_ERROR,
              message: 'Failed to upload file',
            },
          });
        }

        const user = request.user as { sub: number; username: string } | undefined;
        await auditService.log({
          userId: user?.sub ?? null,
          username: user?.username ?? null,
          action: 'upload',
          resourceType: 'file',
          resourceId: String(serverId),
          details: { path: filePath, size: buffer.length },
          ip: request.ip,
        });

        return reply.status(201).send({
          success: true,
          data: result.data,
        });
      } catch {
        return reply.status(500).send({
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to upload file',
          },
        });
      }
    }
  );
}
