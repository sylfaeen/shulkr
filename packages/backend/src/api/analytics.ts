import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import type { AppDeps } from '@shulkr/backend/deps';
import {
  analyticsActivity,
  analyticsPeakHours,
  analyticsSessionDuration,
  analyticsSummary,
  analyticsRetention,
} from '@shulkr/backend/services/analytics_service';
import { withAuth } from '@shulkr/backend/api/_shared';

const s = initServer();

export function createAnalyticsRoutes(deps: AppDeps) {
  return s.router(contract.analytics, {
    activity: ({ request, params, query }) =>
      withAuth(request, 'server:players:history', () => ({
        status: 200 as const,
        body: analyticsActivity(deps, params.serverId, query.period),
      })),
    peakHours: ({ request, params, query }) =>
      withAuth(request, 'server:players:history', () => ({
        status: 200 as const,
        body: analyticsPeakHours(deps, params.serverId, query.period),
      })),
    sessionDuration: ({ request, params, query }) =>
      withAuth(request, 'server:players:history', () => ({
        status: 200 as const,
        body: analyticsSessionDuration(deps, params.serverId, query.period),
      })),
    summary: ({ request, params, query }) =>
      withAuth(request, 'server:players:history', () => ({
        status: 200 as const,
        body: analyticsSummary(deps, params.serverId, query.period),
      })),
    retention: ({ request, params, query }) =>
      withAuth(request, 'server:players:history', () => ({
        status: 200 as const,
        body: analyticsRetention(deps, params.serverId, query.weeks ?? 8),
      })),
  });
}
