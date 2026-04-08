import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { serverConfigService } from '@shulkr/backend/services/server_config_service';
import { authenticate, assertPermissions, isMiddlewareError } from './middleware';

const s = initServer();

export const serverConfigRoutes = s.router(contract.serverConfig, {
  export: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');

      const config = await serverConfigService.exportConfig(params.serverId, user.username, body.description ?? '');

      if (!config) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      return { status: 200 as const, body: config };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  import: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');

      const validation = serverConfigService.validateConfig(body);
      if (!validation.valid) {
        return { status: 400 as const, body: { code: 'INVALID_CONFIG', message: validation.error ?? 'Invalid config' } };
      }

      const result = await serverConfigService.importConfig(params.serverId, body);

      if (!result.success) {
        return { status: 400 as const, body: { code: 'IMPORT_FAILED', message: result.error ?? 'Import failed' } };
      }

      return { status: 200 as const, body: { message: 'Configuration imported successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  validate: async ({ request, body }) => {
    try {
      await authenticate(request);

      const result = serverConfigService.validateConfig(body);
      return { status: 200 as const, body: { valid: result.valid, error: result.error } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
