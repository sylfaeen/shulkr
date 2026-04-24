import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { sftpService } from '@shulkr/backend/services/sftp_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

export const sftpRoutes = s.router(contract.sftp, {
  getInfo: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:sftp:read');
      const result = sftpService.getSftpInfo();
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
      const accounts = await sftpService.listAccounts(query.serverId);
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
      const result = await sftpService.createAccount(body);
      await auditService.log({
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
      throw error;
    }
  },
  update: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:sftp:update');
      const result = await sftpService.updateAccount(body);
      await auditService.log({
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
      const serverId = await sftpService.getAccountServerId(accountId);
      await sftpService.deleteAccount(accountId);
      await auditService.log({
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
