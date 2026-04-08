import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { worldService } from '@shulkr/backend/services/world_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, isMiddlewareError } from './middleware';

const s = initServer();

export const worldsRoutes = s.router(contract.worlds, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');

      const result = await worldService.listWorlds(params.serverId);
      if (!result) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  setActive: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');

      const result = await worldService.setActiveWorld(params.serverId, body.worldName);
      if (!result.success) {
        return { status: 400 as const, body: { code: 'SET_ACTIVE_FAILED', message: result.error ?? 'Failed' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'set_active_world',
        resourceType: 'world',
        resourceId: params.serverId,
        details: { worldName: body.worldName },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Active world updated. Restart required.' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  reset: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');

      const createBackup = query.createBackup ?? false;
      const result = await worldService.resetWorld(params.serverId, params.worldName, createBackup);

      if (!result.success) {
        return { status: 400 as const, body: { code: 'RESET_FAILED', message: result.error ?? 'Failed' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'reset_world',
        resourceType: 'world',
        resourceId: params.serverId,
        details: { worldName: params.worldName, backup: String(createBackup) },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'World reset successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
