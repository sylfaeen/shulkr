import type { FastifyInstance } from 'fastify';
import { fileRoutes, fileDownloadRoute } from '@shulkr/backend/routes/files';
import { pluginRoutes } from '@shulkr/backend/routes/plugins';
import { backupRoutes } from '@shulkr/backend/routes/backups';
import { worldRoutes } from '@shulkr/backend/routes/worlds';

export async function registerRoutes(fastify: FastifyInstance) {
  await fastify.register(fileDownloadRoute, { prefix: '/api/servers' });
  await fastify.register(fileRoutes, { prefix: '/api/servers' });
  await fastify.register(pluginRoutes, { prefix: '/api/servers' });
  await fastify.register(backupRoutes, { prefix: '/api/servers' });
  await fastify.register(worldRoutes, { prefix: '/api/servers' });
}
