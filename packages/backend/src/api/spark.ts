import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { sparkService } from '@shulkr/backend/services/spark_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const ONE_MINUTE = 60_000;

export const sparkRoutes = s.router(contract.spark, {
  status: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:read');

      const installed = await sparkService.isInstalled(params.serverId);
      return { status: 200 as const, body: { installed } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  startProfiler: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:input');
      checkRateLimit(`user:${user.sub}:spark.profiler`, 5, ONE_MINUTE);

      const result = await sparkService.startProfiler(params.serverId);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  stopProfiler: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:input');

      const result = await sparkService.stopProfiler(params.serverId);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  health: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:read');

      const result = await sparkService.getHealth(params.serverId);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
