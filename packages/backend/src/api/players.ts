import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { playerHistoryService } from '@shulkr/backend/services/player_history_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const ONE_MINUTE = 60_000;

async function getServerPath(serverId: string): Promise<string | null> {
  const [server] = await db.select({ path: servers.path }).from(servers).where(eq(servers.id, serverId)).limit(1);
  return server?.path ?? null;
}

async function readWhitelistFile(serverPath: string): Promise<Array<{ uuid: string; name: string }>> {
  const filePath = path.join(serverPath, 'whitelist.json');
  if (!existsSync(filePath)) return [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Array<{ uuid: string; name: string }>;
  } catch {
    return [];
  }
}

interface BannedPlayerEntry {
  uuid: string;
  name: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

interface BannedIpEntry {
  ip: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

async function readBannedPlayersFile(serverPath: string): Promise<Array<BannedPlayerEntry>> {
  const filePath = path.join(serverPath, 'banned-players.json');
  if (!existsSync(filePath)) return [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Array<BannedPlayerEntry>;
  } catch {
    return [];
  }
}

async function readBannedIpsFile(serverPath: string): Promise<Array<BannedIpEntry>> {
  const filePath = path.join(serverPath, 'banned-ips.json');
  if (!existsSync(filePath)) return [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Array<BannedIpEntry>;
  } catch {
    return [];
  }
}

async function readServerProperty(serverPath: string, key: string): Promise<string | null> {
  const filePath = path.join(serverPath, 'server.properties');
  if (!existsSync(filePath)) return null;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const playersRoutes = s.router(contract.players, {
  history: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');

      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;
      const result = playerHistoryService.queryHistory(params.serverId, limit, offset);

      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  whitelist: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:whitelist');

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const entries = await readWhitelistFile(serverPath);
      const whiteListValue = await readServerProperty(serverPath, 'white-list');
      const enabled = whiteListValue === 'true';

      return { status: 200 as const, body: { entries, enabled } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  whitelistAdd: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:whitelist');
      checkRateLimit(`user:${user.sub}:whitelist.add`, 10, ONE_MINUTE);

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const status = serverProcessManager.getStatus(params.serverId);
      if (status.status === 'running') {
        serverProcessManager.sendCommand(params.serverId, `whitelist add ${body.name}`);
      } else {
        // Direct file edit when server is stopped
        const entries = await readWhitelistFile(serverPath);
        if (!entries.some((e) => e.name.toLowerCase() === body.name.toLowerCase())) {
          entries.push({ uuid: '', name: body.name });
          await fs.writeFile(path.join(serverPath, 'whitelist.json'), JSON.stringify(entries, null, 2), 'utf-8');
        }
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'whitelist_add',
        resourceType: 'player',
        resourceId: params.serverId,
        details: { playerName: body.name },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Player added to whitelist' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  whitelistRemove: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:whitelist');
      checkRateLimit(`user:${user.sub}:whitelist.remove`, 10, ONE_MINUTE);

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const playerName = params.playerName;
      const status = serverProcessManager.getStatus(params.serverId);

      if (status.status === 'running') {
        serverProcessManager.sendCommand(params.serverId, `whitelist remove ${playerName}`);
      } else {
        const entries = await readWhitelistFile(serverPath);
        const filtered = entries.filter((e) => e.name.toLowerCase() !== playerName.toLowerCase());
        await fs.writeFile(path.join(serverPath, 'whitelist.json'), JSON.stringify(filtered, null, 2), 'utf-8');
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'whitelist_remove',
        resourceType: 'player',
        resourceId: params.serverId,
        details: { playerName },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Player removed from whitelist' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  bannedPlayers: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:bans');

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const entries = await readBannedPlayersFile(serverPath);
      return { status: 200 as const, body: { entries } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  bannedIps: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:bans');

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const entries = await readBannedIpsFile(serverPath);
      return { status: 200 as const, body: { entries } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  pardon: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:pardon');
      checkRateLimit(`user:${user.sub}:pardon`, 10, ONE_MINUTE);

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const playerName = params.playerName;
      const status = serverProcessManager.getStatus(params.serverId);

      if (status.status === 'running') {
        serverProcessManager.sendCommand(params.serverId, `pardon ${playerName}`);
      } else {
        const entries = await readBannedPlayersFile(serverPath);
        const filtered = entries.filter((e) => e.name.toLowerCase() !== playerName.toLowerCase());
        await fs.writeFile(path.join(serverPath, 'banned-players.json'), JSON.stringify(filtered, null, 2), 'utf-8');
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'pardon',
        resourceType: 'player',
        resourceId: params.serverId,
        details: { playerName },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Player unbanned' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  pardonIp: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:pardon');
      checkRateLimit(`user:${user.sub}:pardon-ip`, 10, ONE_MINUTE);

      const serverPath = await getServerPath(params.serverId);
      if (!serverPath) {
        return { status: 401 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const ip = params.ip;
      const status = serverProcessManager.getStatus(params.serverId);

      if (status.status === 'running') {
        serverProcessManager.sendCommand(params.serverId, `pardon-ip ${ip}`);
      } else {
        const entries = await readBannedIpsFile(serverPath);
        const filtered = entries.filter((e) => e.ip !== ip);
        await fs.writeFile(path.join(serverPath, 'banned-ips.json'), JSON.stringify(filtered, null, 2), 'utf-8');
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'pardon_ip',
        resourceType: 'player',
        resourceId: params.serverId,
        details: { ip },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'IP unbanned' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
