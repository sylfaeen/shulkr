import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '@shulkr/shared';
import { fileService } from '@shulkr/backend/services/file_service';
import { serverService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
const PLUGINS_FOLDER = 'plugins';

export async function pluginRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /api/servers/:serverId/plugins: Upload plugin (multipart/form-data)
  fastify.post(
    '/:serverId/plugins',
    { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: { serverId: string } }>, reply: FastifyReply) => {
      if (!fastify.assertPermission(request, reply, 'server:plugins:upload')) return;

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

        if (!data.filename.endsWith('.jar')) {
          return reply.status(400).send({
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: 'Only .jar files are allowed',
            },
          });
        }

        const buffer = await data.toBuffer();
        const filePath = `${PLUGINS_FOLDER}/${data.filename}`;

        const result = await fileService.uploadFile(server.path, filePath, buffer);

        if (!result.success) {
          return reply.status(500).send({
            success: false,
            error: {
              code: ErrorCodes.INTERNAL_ERROR,
              message: 'Failed to upload plugin',
            },
          });
        }

        const user = request.user as { sub: number; username: string } | undefined;
        await auditService.log({
          userId: user?.sub ?? null,
          username: user?.username ?? null,
          action: 'upload',
          resourceType: 'plugin',
          resourceId: String(serverId),
          details: { filename: data.filename, size: buffer.length },
          ip: request.ip,
        });

        return reply.status(201).send({
          success: true,
          data: {
            name: data.filename,
            size: buffer.length,
            message: 'Plugin uploaded. Server restart required to load the plugin.',
          },
        });
      } catch {
        return reply.status(500).send({
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to upload plugin',
          },
        });
      }
    }
  );
}
