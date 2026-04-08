import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { ServerService } from '@shulkr/backend/services/server_service';
import { backupService } from '@shulkr/backend/services/backup_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { ErrorCodes } from '@shulkr/shared';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

export const serversRoutes = s.router(contract.servers, {
  list: async ({ request }) => {
    try {
      await authenticate(request);
      const result = await serverService.getAllServers();
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  byId: async ({ request, params }) => {
    try {
      await authenticate(request);
      const server = await serverService.getServerById(params.id);

      if (!server) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }

      return { status: 200 as const, body: server };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');
      checkRateLimit(`user:${user.sub}:servers.create`, 10, ONE_MINUTE);

      const server = await serverService.createServer(body);

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'server',
        resourceId: server.id,
        details: { name: body.name },
        ip: request.ip,
      });

      return { status: 201 as const, body: { ...server, cpu: null, player_count: 0 } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error && error.message === ErrorCodes.SERVER_PORT_ALREADY_IN_USE) {
        return {
          status: 409 as const,
          body: { code: ErrorCodes.SERVER_PORT_ALREADY_IN_USE, message: ErrorCodes.SERVER_PORT_ALREADY_IN_USE },
        };
      }
      throw error;
    }
  },

  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');
      checkRateLimit(`user:${user.sub}:servers.update`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.updateServer(id, body);

      if (!result.success) {
        if (result.error === ErrorCodes.SERVER_PORT_ALREADY_IN_USE) {
          return {
            status: 409 as const,
            body: { code: ErrorCodes.SERVER_PORT_ALREADY_IN_USE, message: ErrorCodes.SERVER_PORT_ALREADY_IN_USE },
          };
        }
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'update',
        resourceType: 'server',
        resourceId: id,
        ip: request.ip,
      });

      const fullServer = await serverService.getServerById(id);
      return { status: 200 as const, body: fullServer ?? { ...result.server, cpu: null, player_count: 0 } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:general');
      checkRateLimit(`user:${user.sub}:servers.delete`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.deleteServer(id, {
        createBackup: query.createBackup ?? false,
      });

      if (!result.success) {
        if (result.error === 'SERVER_NOT_FOUND') {
          return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
        }
        if (result.error === 'SERVER_MUST_BE_STOPPED') {
          return {
            status: 409 as const,
            body: { code: ErrorCodes.SERVER_MUST_BE_STOPPED, message: ErrorCodes.SERVER_MUST_BE_STOPPED },
          };
        }
        if (result.error?.startsWith('BACKUP_FAILED')) {
          return {
            status: 500 as const,
            body: { code: ErrorCodes.SERVER_BACKUP_FAILED, message: ErrorCodes.SERVER_BACKUP_FAILED },
          };
        }
        if (result.error?.startsWith('DELETE_DIRECTORY_FAILED')) {
          return {
            status: 500 as const,
            body: { code: ErrorCodes.SERVER_DELETE_FAILED, message: ErrorCodes.SERVER_DELETE_FAILED },
          };
        }
        return {
          status: 500 as const,
          body: { code: ErrorCodes.SERVER_DELETE_FAILED, message: ErrorCodes.SERVER_DELETE_FAILED },
        };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'server',
        resourceId: id,
        ip: request.ip,
      });

      return {
        status: 200 as const,
        body: {
          message: 'Server deleted successfully',
          backup: result.backup?.filename
            ? {
                filename: result.backup.filename,
                path: result.backup.path ?? '',
                size: result.backup.size ?? 0,
              }
            : undefined,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  listBackups: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:backups');

      const id = params.id;
      const result = await serverService.listBackups(id);

      if (!result.success) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }

      const backups: Array<{ filename: string; size: number; created: string; status: 'creating' | 'ready' }> =
        result.backups.map((b) => ({
          filename: b.name,
          size: b.size,
          created: b.date,
          status: 'ready' as const,
        }));

      // Prepend pending (creating) backups
      const server = await serverService.getServerById(id);
      if (server) {
        const slug = server.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const pending = backupService.getPendingBackups(slug);
        for (const p of pending) {
          backups.unshift({
            filename: p.filename,
            size: 0,
            created: p.startedAt,
            status: 'creating' as const,
          });
        }
      }

      return { status: 200 as const, body: backups };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  deleteBackup: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:backups');
      checkRateLimit(`user:${user.sub}:servers.deleteBackup`, 50, ONE_MINUTE);

      const result = await serverService.deleteBackup(params.filename);

      if (!result.success) {
        return { status: 200 as const, body: { message: result.error || 'Failed to delete backup' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete_backup',
        resourceType: 'backup',
        details: { filename: params.filename },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Backup deleted successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  backup: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:backups');
      checkRateLimit(`user:${user.sub}:servers.backup`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.backupServerAsync(id, body.paths);

      if (!result.success) {
        if (result.error === 'SERVER_NOT_FOUND') {
          return { status: 200 as const, body: { message: 'Server not found' } };
        }
        return { status: 200 as const, body: { message: result.error || 'Backup failed' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create_backup',
        resourceType: 'backup',
        resourceId: String(id),
        details: { filename: result.filename },
        ip: request.ip,
      });

      return {
        status: 200 as const,
        body: {
          message: 'Backup started',
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  start: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:power');
      checkRateLimit(`user:${user.sub}:servers.start`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.startServer(id);

      if (!result.success) {
        const errorMap: Record<string, { status: 400 | 404; code: string; message: string }> = {
          [ErrorCodes.SERVER_NOT_FOUND]: { status: 404, code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND },
          [ErrorCodes.SERVER_ALREADY_RUNNING]: {
            status: 400,
            code: ErrorCodes.SERVER_ALREADY_RUNNING,
            message: ErrorCodes.SERVER_ALREADY_RUNNING,
          },
          [ErrorCodes.SERVER_DIR_NOT_FOUND]: {
            status: 400,
            code: ErrorCodes.SERVER_DIR_NOT_FOUND,
            message: ErrorCodes.SERVER_DIR_NOT_FOUND,
          },
          [ErrorCodes.SERVER_JAR_NOT_FOUND]: {
            status: 400,
            code: ErrorCodes.SERVER_JAR_NOT_FOUND,
            message: ErrorCodes.SERVER_JAR_NOT_FOUND,
          },
          [ErrorCodes.SERVER_JAVA_NOT_FOUND]: {
            status: 400,
            code: ErrorCodes.SERVER_JAVA_NOT_FOUND,
            message: ErrorCodes.SERVER_JAVA_NOT_FOUND,
          },
          [ErrorCodes.SERVER_START_FAILED]: {
            status: 400,
            code: ErrorCodes.SERVER_START_FAILED,
            message: ErrorCodes.SERVER_START_FAILED,
          },
        };

        const err = errorMap[result.error || ErrorCodes.SERVER_START_FAILED] || {
          status: 400 as const,
          code: ErrorCodes.SERVER_START_FAILED,
          message: ErrorCodes.SERVER_START_FAILED,
        };

        if (err.status === 404) {
          return { status: 404 as const, body: { code: err.code, message: err.message } };
        }
        return { status: 400 as const, body: { code: err.code, message: err.message } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'start',
        resourceType: 'server',
        resourceId: String(id),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Server started successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  stop: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:power');
      checkRateLimit(`user:${user.sub}:servers.stop`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.stopServer(id);

      if (!result.success) {
        const errorMap: Record<string, { status: 400 | 404; code: string; message: string }> = {
          [ErrorCodes.SERVER_NOT_FOUND]: { status: 404, code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND },
          [ErrorCodes.SERVER_NOT_RUNNING]: {
            status: 400,
            code: ErrorCodes.SERVER_NOT_RUNNING,
            message: ErrorCodes.SERVER_NOT_RUNNING,
          },
          [ErrorCodes.SERVER_ALREADY_STOPPING]: {
            status: 400,
            code: ErrorCodes.SERVER_ALREADY_STOPPING,
            message: ErrorCodes.SERVER_ALREADY_STOPPING,
          },
        };

        const err = errorMap[result.error || ErrorCodes.SERVER_STOP_FAILED] || {
          status: 400 as const,
          code: ErrorCodes.SERVER_STOP_FAILED,
          message: ErrorCodes.SERVER_STOP_FAILED,
        };

        if (err.status === 404) {
          return { status: 404 as const, body: { code: err.code, message: err.message } };
        }
        return { status: 400 as const, body: { code: err.code, message: err.message } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'stop',
        resourceType: 'server',
        resourceId: String(id),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Server stopped successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  restart: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:power');
      checkRateLimit(`user:${user.sub}:servers.restart`, 10, ONE_MINUTE);

      const id = params.id;
      const result = await serverService.restartServer(id);

      if (!result.success) {
        return { status: 200 as const, body: { message: result.error || 'Failed to restart server' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'restart',
        resourceType: 'server',
        resourceId: String(id),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Server restarted successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
