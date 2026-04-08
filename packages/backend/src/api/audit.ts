import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, isMiddlewareError } from './middleware';

const s = initServer();

export const auditRoutes = s.router(contract.audit, {
  list: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage');

      const result = await auditService.query({
        userId: query.userId,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        limit: query.limit ?? 100,
        offset: query.offset ?? 0,
      });

      const entries = result.logs.map((log) => ({
        id: log.id,
        userId: log.user_id ?? 0,
        username: log.username ?? '',
        action: log.action,
        resourceType: log.resource_type,
        resourceId: log.resource_id ?? null,
        details: log.details ? (JSON.parse(log.details) as Record<string, string>) : null,
        ipAddress: log.ip ?? null,
        createdAt: log.created_at,
      }));

      return { status: 200 as const, body: { entries, total: result.total } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
