import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { queryAuditLogs } from '@shulkr/backend/services/audit_service';
import { getServerById } from '@shulkr/backend/services/server_service';
import { withAuth } from '@shulkr/backend/api/_shared';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();

const SERVER_RESOURCE_TYPES = new Set(['server', 'backup', 'file', 'plugin', 'task', 'player', 'sftp_account', 'world']);

export function createAuditRoutes(deps: AppDeps) {
  return s.router(contract.audit, {
    list: ({ request, query }) =>
      withAuth(request, 'users:manage:audit', async () => {
        const result = await queryAuditLogs(deps, {
          userId: query.userId,
          resourceType: query.resourceType,
          resourceId: query.resourceId,
          limit: query.limit ?? 100,
          offset: query.offset ?? 0,
        });

        const serverIds = [
          ...new Set(
            result.logs
              .filter((log) => SERVER_RESOURCE_TYPES.has(log.resource_type) && log.resource_id)
              .map((log) => log.resource_id!)
          ),
        ];

        const serverNames = new Map<string, string>();

        await Promise.all(
          serverIds.map(async (id) => {
            const server = await getServerById(deps, id);
            if (server) serverNames.set(id, server.name);
          })
        );

        const entries = result.logs.map((log) => ({
          id: log.id,
          userId: log.user_id ?? 0,
          username: log.username ?? '',
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id ?? null,
          resourceName:
            SERVER_RESOURCE_TYPES.has(log.resource_type) && log.resource_id ? (serverNames.get(log.resource_id) ?? null) : null,
          details: log.details ? (JSON.parse(log.details) as Record<string, string>) : null,
          ipAddress: log.ip ?? null,
          createdAt: log.created_at,
        }));

        return { status: 200 as const, body: { entries, total: result.total } };
      }),
  });
}
