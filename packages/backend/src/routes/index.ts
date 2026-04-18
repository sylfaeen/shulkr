import type { FastifyInstance } from 'fastify';
import { fileRoutes, fileDownloadRoute } from '@shulkr/backend/routes/files';
import { pluginRoutes } from '@shulkr/backend/routes/plugins';
import { backupRoutes } from '@shulkr/backend/routes/backups';
import { databaseDownloadRoute } from '@shulkr/backend/routes/database';
import { avatarRoute } from '@shulkr/backend/routes/avatars';
import { textureRoute } from '@shulkr/backend/routes/textures';

export async function registerRoutes(fastify: FastifyInstance) {
  await fastify.register(fileDownloadRoute, { prefix: '/api/servers' });
  await fastify.register(fileRoutes, { prefix: '/api/servers' });
  await fastify.register(pluginRoutes, { prefix: '/api/servers' });
  await fastify.register(backupRoutes, { prefix: '/api/servers' });
  await fastify.register(databaseDownloadRoute, { prefix: '/api/settings' });
  await fastify.register(avatarRoute, { prefix: '/api/players' });
  await fastify.register(textureRoute, { prefix: '/api/minecraft/texture' });
}
