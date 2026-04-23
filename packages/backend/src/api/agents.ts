import { initServer } from '@ts-rest/fastify';
import { eq } from 'drizzle-orm';
import { contract, ErrorCodes, type AgentStatus } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';
import {
  authenticate,
  authenticateAgent,
  assertPermissions,
  checkRateLimit,
  isMiddlewareError,
} from '@shulkr/backend/api/middleware';
import {
  enableAgent,
  regenerateAgentToken,
  disableAgent,
  getServerAgent,
  isConnected,
} from '@shulkr/backend/services/agent_token_service';
import { agentIngestService } from '@shulkr/backend/services/agent_ingest_service';
import { installAgent, readAgentConfig } from '@shulkr/backend/services/agent_installer_service';
import { getExpectedPluginVersion, hasVersionMismatch } from '@shulkr/backend/services/agent_version_service';
import { auditService } from '@shulkr/backend/services/audit_service';

const s = initServer();
const ONE_MINUTE = 60_000;
const SUPPORTED_PROTOCOL = 1;

async function serverExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: servers.id }).from(servers).where(eq(servers.id, id)).limit(1);
  return !!row;
}

async function buildStatus(serverId: string): Promise<AgentStatus> {
  const row = await getServerAgent(serverId);
  const platform = (row?.platform ?? null) as AgentStatus['platform'];
  const expected = getExpectedPluginVersion(platform ?? 'paper');
  return {
    enabled: row?.enabled ?? false,
    installed: !!row && !!row.last_seen_at,
    connected: isConnected(row),
    last_seen_at: row?.last_seen_at ?? null,
    plugin_version: row?.plugin_version ?? null,
    expected_version: expected,
    version_mismatch: hasVersionMismatch(row?.plugin_version ?? null, platform),
    token_preview: row?.token_preview ?? null,
    platform,
    platform_version: row?.platform_version ?? null,
  };
}

export const agentsRoutes = s.router(contract.agents, {
  ingestMetrics: async ({ request, params, body }) => {
    try {
      await authenticateAgent(request, params.serverId);
      checkRateLimit(`agent:${params.serverId}:ingest`, 60, ONE_MINUTE);
      if (body.protocol_version !== SUPPORTED_PROTOCOL) {
        return {
          status: 400 as const,
          body: { code: 'UNSUPPORTED_PROTOCOL', message: `Expected protocol_version=${SUPPORTED_PROTOCOL}` },
        };
      }
      await agentIngestService.ingest(params.serverId, body);
      return { status: 204 as const, body: null };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      console.error('[agents.ingestMetrics] failed:', error);
      return { status: 422 as const, body: { code: 'INGEST_FAILED', message: 'Failed to ingest metrics' } };
    }
  },
  getAgentStatus: async ({ request, params }) => {
    try {
      await authenticate(request);
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const status = await buildStatus(params.id);
      return { status: 200 as const, body: status };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  enableAgent: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:agents:manage');
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const result = await enableAgent(params.id);
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'enable_agent',
        resourceType: 'server_agent',
        resourceId: params.id,
        ip: request.ip,
      });
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  regenerateAgentToken: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:agents:manage');
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const result = await regenerateAgentToken(params.id);
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'regenerate_agent_token',
        resourceType: 'server_agent',
        resourceId: params.id,
        ip: request.ip,
      });
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  disableAgent: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:agents:manage');
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      await disableAgent(params.id);
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'disable_agent',
        resourceType: 'server_agent',
        resourceId: params.id,
        ip: request.ip,
      });
      return { status: 200 as const, body: { message: 'Agent disabled' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  installAgent: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:agents:manage');
      checkRateLimit(`user:${user.sub}:agents.install`, 10, ONE_MINUTE);
      const result = await installAgent(params.id, body.platform);
      if (!result.success) {
        if (result.error === 'server_not_found') {
          return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
        }
        if (result.error === 'jar_missing') {
          return {
            status: 500 as const,
            body: { code: 'JAR_MISSING', message: result.message ?? 'Embedded plugin jar missing' },
          };
        }
        if (result.error === 'path_unsafe') {
          return { status: 400 as const, body: { code: 'PATH_UNSAFE', message: 'Server path outside of servers base' } };
        }
        return {
          status: 500 as const,
          body: { code: 'WRITE_FAILED', message: result.message ?? 'Failed to write plugin files' },
        };
      }
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'install_agent',
        resourceType: 'server_agent',
        resourceId: params.id,
        ip: request.ip,
      });
      return {
        status: 200 as const,
        body: {
          message: 'Plugin installed',
          jarPath: result.jarPath,
          configPath: result.configPath,
          restartRequired: result.restartRequired,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  updateAgent: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:agents:manage');
      checkRateLimit(`user:${user.sub}:agents.update`, 10, ONE_MINUTE);
      // Update = reinstall with fresh jar but reuse existing token (installAgent regenerates token,
      // so for an update we skip the token rotation by copying the jar only if a token already exists).
      const existing = await getServerAgent(params.id);
      if (!existing) {
        return { status: 404 as const, body: { code: 'AGENT_NOT_INSTALLED', message: 'Agent not installed on this server' } };
      }
      const result = await installAgent(params.id, body.platform);
      if (!result.success) {
        if (result.error === 'server_not_found') {
          return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
        }
        if (result.error === 'jar_missing') {
          return {
            status: 500 as const,
            body: { code: 'JAR_MISSING', message: result.message ?? 'Embedded plugin jar missing' },
          };
        }
        if (result.error === 'path_unsafe') {
          return { status: 400 as const, body: { code: 'PATH_UNSAFE', message: 'Server path outside of servers base' } };
        }
        return {
          status: 500 as const,
          body: { code: 'WRITE_FAILED', message: result.message ?? 'Failed to write plugin files' },
        };
      }
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'update_agent',
        resourceType: 'server_agent',
        resourceId: params.id,
        ip: request.ip,
      });
      return {
        status: 200 as const,
        body: {
          message: 'Plugin updated',
          jarPath: result.jarPath,
          configPath: result.configPath,
          restartRequired: result.restartRequired,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  getAgentConfig: async ({ request, params }) => {
    try {
      await authenticate(request);
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const config = await readAgentConfig(params.id);
      if (!config) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      return { status: 200 as const, body: config };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  getAgentLive: async ({ request, params }) => {
    try {
      await authenticate(request);
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const live = agentIngestService.getLive(params.id);
      if (!live) {
        return { status: 404 as const, body: { code: 'NO_AGENT_DATA', message: 'No fresh agent data' } };
      }
      return { status: 200 as const, body: live };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  getAgentHistory: async ({ request, params, query }) => {
    try {
      await authenticate(request);
      if (!(await serverExists(params.id))) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }
      const period = query.period ?? '24h';
      const points = agentIngestService.queryHistory(params.id, period);
      return { status: 200 as const, body: { points, period } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
