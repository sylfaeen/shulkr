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

async function resolveServerIdFromBackupFilename(filename: string): Promise<string | undefined> {
  const slugMatch = filename.match(/^([a-z0-9-]+?)-(?:manual|auto)/);
  if (!slugMatch) return undefined;
  const allServers = await serverService.getAllServers();
  const slug = slugMatch[1];
  const server = allServers.find((s: { name: string; id: string }) => {
    const serverSlug = s.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return serverSlug === slug;
  });
  return server?.id;
}

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
      assertPermissions(user, 'server:general:create');
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
      assertPermissions(user, 'server:general:update');
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
      assertPermissions(user, 'server:general:delete');
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
      assertPermissions(user, 'server:backups:list');

      const id = params.id;
      const result = await serverService.listBackups(id);

      if (!result.success) {
        return { status: 404 as const, body: { code: ErrorCodes.SERVER_NOT_FOUND, message: ErrorCodes.SERVER_NOT_FOUND } };
      }

      // Collect pending backups so we can mark them as "creating" even if already on disk
      const server = await serverService.getServerById(id);
      const pendingMap = new Map<string, { progress: number; startedAt: string }>();
      if (server) {
        const slug = server.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const pending = backupService.getPendingBackups(slug);
        for (const p of pending) {
          pendingMap.set(p.filename, { progress: p.progress, startedAt: p.startedAt });
        }
      }

      const backups: Array<{ filename: string; size: number; created: string; status: 'creating' | 'ready'; progress?: number }> =
        result.backups.map((b) => {
          const pending = pendingMap.get(b.name);
          return {
            filename: b.name,
            size: b.size,
            created: b.date,
            status: pending ? ('creating' as const) : ('ready' as const),
            ...(pending && { progress: pending.progress }),
          };
        });

      // Add pending backups that haven't appeared on disk yet
      if (server) {
        const diskFilenames = new Set(backups.map((b) => b.filename));
        for (const [filename, info] of pendingMap) {
          if (!diskFilenames.has(filename)) {
            backups.unshift({
              filename,
              size: 0,
              created: info.startedAt,
              status: 'creating' as const,
              progress: info.progress,
            });
          }
        }
      }

      return { status: 200 as const, body: backups };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  renameBackup: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:backups:rename');
      checkRateLimit(`user:${user.sub}:servers.renameBackup`, 20, ONE_MINUTE);

      const result = await serverService.renameBackup(params.filename, body.newFilename);

      if (!result.success) {
        return { status: 200 as const, body: { message: result.error || 'Failed to rename backup' } };
      }

      const renameServerId = await resolveServerIdFromBackupFilename(params.filename);
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'rename_backup',
        resourceType: 'backup',
        resourceId: renameServerId,
        details: { oldFilename: params.filename, newFilename: body.newFilename },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Backup renamed successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  deleteBackup: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:backups:delete');
      checkRateLimit(`user:${user.sub}:servers.deleteBackup`, 50, ONE_MINUTE);

      const result = await serverService.deleteBackup(params.filename);

      if (!result.success) {
        return { status: 200 as const, body: { message: result.error || 'Failed to delete backup' } };
      }

      const deleteServerId = await resolveServerIdFromBackupFilename(params.filename);
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete_backup',
        resourceType: 'backup',
        resourceId: deleteServerId,
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
      assertPermissions(user, 'server:backups:create');
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
      assertPermissions(user, 'server:power:start');
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
      assertPermissions(user, 'server:power:stop');
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
      assertPermissions(user, 'server:power:restart');
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
