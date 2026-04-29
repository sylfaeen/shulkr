import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import {
  createSftpAccount,
  deleteSftpAccount,
  getSftpAccountServerId,
  getSftpInfo,
  listSftpAccounts,
  updateSftpAccount,
} from '@shulkr/backend/services/sftp_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();

export const sftpRoutes = s.router(contract.sftp, {
  getInfo: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:sftp:read');

      const result = getSftpInfo();

      return {
        status: 200 as const,
        body: {
          host: result.host,
          port: result.port,
          shulkrUser: result.username,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  list: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:sftp:list');

      const accounts = await listSftpAccounts(getAppDeps(), query.serverId);

      return { status: 200 as const, body: { accounts } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  create: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:sftp:create');

      const result = await createSftpAccount(getAppDeps(), body);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'sftp_account',
        resourceId: body.serverId,
        details: { username: body.username, accountId: String(result.id) },
        ip: request.ip,
      });

      return { status: 201 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error && error.message === ErrorCodes.SFTP_USERNAME_TAKEN) {
        return { status: 409 as const, body: { code: error.message, message: 'SFTP username already taken' } };
      }
      throw error;
    }
  },
  update: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:sftp:update');

      const result = await updateSftpAccount(getAppDeps(), body);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'update',
        resourceType: 'sftp_account',
        resourceId: result.serverId,
        details: { username: body.username, accountId: String(body.id) },
        ip: request.ip,
      });

      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:sftp:delete');

      const accountId = Number(params.id);
      const serverId = await getSftpAccountServerId(getAppDeps(), accountId);
      await deleteSftpAccount(getAppDeps(), accountId);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'sftp_account',
        resourceId: serverId ?? undefined,
        details: { accountId: String(accountId) },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'SFTP account deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      const message = error instanceof Error ? error.message : 'Failed to delete SFTP account';
      return { status: 200 as const, body: { message } };
    }
  },
});
