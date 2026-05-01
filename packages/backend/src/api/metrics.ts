import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { queryMetricsHistory, type MetricsPeriod } from '@shulkr/backend/services/metrics_history_service';
import { getGcSummary } from '@shulkr/backend/services/gc_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();

export const metricsRoutes = s.router(contract.metrics, {
  history: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:read');

      const period = (query.period ?? '24h') as MetricsPeriod;
      const points = await queryMetricsHistory(getAppDeps(), params.serverId, period);

      return { status: 200 as const, body: { points, period } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  gc: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:read');

      const hours = query.hours ?? 24;
      const data = getGcSummary(getAppDeps(), params.serverId, hours);

      return { status: 200 as const, body: data };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
