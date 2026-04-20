import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { analyticsService, type AnalyticsPeriod } from '@shulkr/backend/services/analytics_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

export const analyticsRoutes = s.router(contract.analytics, {
  activity: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');
      const data = analyticsService.activity(params.serverId, query.period as AnalyticsPeriod);
      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  peakHours: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');
      const data = analyticsService.peakHours(params.serverId, query.period as AnalyticsPeriod);
      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  sessionDuration: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');
      const data = analyticsService.sessionDuration(params.serverId, query.period as AnalyticsPeriod);
      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  summary: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');
      const data = analyticsService.summary(params.serverId, query.period as AnalyticsPeriod);
      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  retention: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');
      const data = analyticsService.retention(params.serverId, query.weeks ?? 8);
      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
