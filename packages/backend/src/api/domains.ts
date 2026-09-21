import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { getServerById } from '@shulkr/backend/services/server_service';
import {
  addDomain,
  dnsCheckDomain,
  enableDomainSsl,
  ensureCertbotTimer,
  getPanelDomain,
  listDomainsByServer,
  refreshDomainSslExpiry,
  removeDomain,
  removePanelDomain,
  renewAllDomains,
  setPanelDomain,
} from '@shulkr/backend/services/domain_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';
import type { CustomDomain } from '@shulkr/backend/db/schema';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();
const ONE_MINUTE = 60_000;

function formatDomain(domain: CustomDomain) {
  return {
    id: domain.id,
    serverId: domain.server_id ?? null,
    domain: domain.domain,
    port: domain.port,
    type: domain.type,
    sslEnabled: domain.ssl_enabled,
    sslExpiresAt: domain.ssl_expires_at ?? null,
    createdAt: domain.created_at,
    updatedAt: domain.created_at,
  };
}

async function getServerOrThrow(serverId: string) {
  const server = await getServerById(getAppDeps(), serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };

  return server;
}

export const domainsRoutes = s.router(contract.domains, {
  list: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:list');

      await getServerOrThrow(query.serverId);
      const domains = await listDomainsByServer(getAppDeps(), query.serverId);

      return { status: 200 as const, body: { domains: domains.map(formatDomain) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  add: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:add');
      checkRateLimit(`user:${user.sub}:domains.add`, 10, ONE_MINUTE);

      await getServerOrThrow(body.serverId);
      const domain = await addDomain(getAppDeps(), body.serverId, body.domain, body.port, body.type);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'add',
        resourceType: 'domain',
        resourceId: String(body.serverId),
        details: { domain: body.domain, port: body.port, type: body.type },
        ip: request.ip,
      });

      return { status: 201 as const, body: formatDomain(domain) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  remove: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:remove');
      checkRateLimit(`user:${user.sub}:domains.remove`, 10, ONE_MINUTE);

      await removeDomain(getAppDeps(), Number(params.id));

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'remove',
        resourceType: 'domain',
        resourceId: String(params.id),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Domain removed' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      const message = error instanceof Error ? error.message : 'Failed to remove domain';

      return { status: 200 as const, body: { message } };
    }
  },
  enableSsl: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:ssl');
      checkRateLimit(`user:${user.sub}:domains.enableSsl`, 10, ONE_MINUTE);

      await enableDomainSsl(getAppDeps(), Number(params.id));

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'enable-ssl',
        resourceType: 'domain',
        resourceId: String(params.id),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'SSL enabled' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      const message = error instanceof Error ? error.message : 'Failed to enable SSL';

      return { status: 200 as const, body: { message } };
    }
  },
  dnsCheck: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:list');

      const result = await dnsCheckDomain(getAppDeps(), query.domain);

      return {
        status: 200 as const,
        body: {
          match: result.matches,
          expected: result.serverIp || null,
          actual: result.resolvedIp,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  panelDomain: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:general:domain');

      const domain = await getPanelDomain(getAppDeps());

      return { status: 200 as const, body: { domain: domain ? formatDomain(domain) : null } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  setPanelDomain: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:general:domain');
      checkRateLimit(`user:${user.sub}:domains.setPanelDomain`, 10, ONE_MINUTE);

      const domain = await setPanelDomain(getAppDeps(), body.domain, 3001);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'set-panel-domain',
        resourceType: 'domain',
        details: { domain: body.domain },
        ip: request.ip,
      });

      return { status: 200 as const, body: formatDomain(domain) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  removePanelDomain: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:general:domain');
      checkRateLimit(`user:${user.sub}:domains.removePanelDomain`, 10, ONE_MINUTE);

      await removePanelDomain(getAppDeps());

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'remove-panel-domain',
        resourceType: 'domain',
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Panel domain removed' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      const message = error instanceof Error ? error.message : 'Failed to remove panel domain';

      return { status: 200 as const, body: { message } };
    }
  },
  renew: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:ssl');
      checkRateLimit(`user:${user.sub}:domains.renew`, 10, ONE_MINUTE);

      const result = await renewAllDomains(getAppDeps());

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'renew-ssl',
        resourceType: 'domain',
        ip: request.ip,
      });

      const scriptResult = result as unknown as { renewed?: number; failed?: number };

      return {
        status: 200 as const,
        body: {
          renewed: scriptResult.renewed ?? (result.success ? 1 : 0),
          failed: scriptResult.failed ?? (result.success ? 0 : 1),
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      return { status: 200 as const, body: { renewed: 0, failed: 0 } };
    }
  },
  refreshExpiry: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:ssl');

      const result = await refreshDomainSslExpiry(getAppDeps(), Number(params.id));
      if (!result) throw new Error('Domain not found or SSL not enabled');

      return { status: 200 as const, body: formatDomain(result) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  ensureTimer: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:domains:ssl');
      const result = await ensureCertbotTimer(getAppDeps());

      return { status: 200 as const, body: { active: result.success } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
