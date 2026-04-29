import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { addGlobalIpBan, listGlobalIpBans, removeGlobalIpBan } from '@shulkr/backend/services/global_ip_ban_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();

export const globalIpBansRoutes = s.router(contract.globalIpBans, {
  list: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:globalIpBans:list');

      const bans = await listGlobalIpBans(getAppDeps());

      return { status: 200 as const, body: { bans } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  add: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:globalIpBans:add');

      const ban = await addGlobalIpBan(getAppDeps(), {
        ip: body.ip,
        reason: body.reason ?? null,
        playerName: body.player_name ?? null,
        bannedBy: user.username,
        requestSourceIp: request.ip,
      });

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'add',
        resourceType: 'global_ip_ban',
        resourceId: String(ban.id),
        details: { ip: ban.ip, reason: ban.reason, player_name: ban.player_name },
        ip: request.ip,
      });

      return { status: 201 as const, body: ban };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error) {
        if (error.message === ErrorCodes.GLOBAL_IP_BAN_INVALID_IP) {
          return { status: 400 as const, body: { code: error.message, message: 'Invalid IP address' } };
        }
        if (error.message === ErrorCodes.GLOBAL_IP_BAN_CANNOT_BAN_SELF) {
          return { status: 400 as const, body: { code: error.message, message: 'Cannot ban your own IP' } };
        }
        if (error.message === ErrorCodes.GLOBAL_IP_BAN_ALREADY_EXISTS) {
          return { status: 409 as const, body: { code: error.message, message: 'IP is already banned' } };
        }
        if (error.message === ErrorCodes.GLOBAL_IP_BAN_SCRIPT_FAILED) {
          return { status: 400 as const, body: { code: error.message, message: 'Firewall script failed to apply ban' } };
        }
      }
      throw error;
    }
  },
  remove: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:globalIpBans:remove');

      const banId = Number(params.banId);
      await removeGlobalIpBan(getAppDeps(), banId);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'remove',
        resourceType: 'global_ip_ban',
        resourceId: String(banId),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Ban removed' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error) {
        if (error.message === ErrorCodes.GLOBAL_IP_BAN_NOT_FOUND) {
          return { status: 404 as const, body: { code: error.message, message: 'Ban not found' } };
        }
      }
      throw error;
    }
  },
});
