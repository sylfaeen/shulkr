import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { fileService } from '@shulkr/backend/services/file_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

const FILE_ERROR_MAP: Record<string, string> = {
  FILE_PATH_TRAVERSAL: 'Access denied: invalid path',
  FILE_NOT_FOUND: 'File or directory not found',
  FILE_ACCESS_DENIED: 'Access denied',
  NOT_A_DIRECTORY: 'Path is not a directory',
  IS_A_DIRECTORY: 'Path is a directory, not a file',
  FILE_TOO_LARGE: 'File is too large to read (max 10MB)',
  FILE_ALREADY_EXISTS: 'File or directory already exists',
  CANNOT_DELETE_ROOT: 'Cannot delete root directory',
};

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };
  return server;
}

export const filesRoutes = s.router(contract.files, {
  list: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:read');

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.listDirectory(server.path, query.path || '/');

      if (!result.success) {
        return { status: 200 as const, body: [] };
      }

      const files = result.data.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        modified: file.modified,
      }));

      return { status: 200 as const, body: files };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  read: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:read');

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.readFile(server.path, query.path);

      if (!result.success) {
        return {
          status: 200 as const,
          body: { path: query.path, content: '' },
        };
      }

      return { status: 200 as const, body: { path: query.path, content: result.data } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  write: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:write');
      checkRateLimit(`user:${user.sub}:files.write`, 30, ONE_MINUTE);

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.writeFile(server.path, body.path, body.content);

      if (!result.success) {
        return { status: 200 as const, body: { message: FILE_ERROR_MAP[result.error] || 'Internal server error' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'write',
        resourceType: 'file',
        resourceId: String(params.serverId),
        details: { path: body.path },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'File saved' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:write');
      checkRateLimit(`user:${user.sub}:files.delete`, 30, ONE_MINUTE);

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.deleteFile(server.path, query.path);

      if (!result.success) {
        return { status: 200 as const, body: { message: FILE_ERROR_MAP[result.error] || 'Internal server error' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'file',
        resourceId: String(params.serverId),
        details: { path: query.path },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'File deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  mkdir: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:write');
      checkRateLimit(`user:${user.sub}:files.mkdir`, 30, ONE_MINUTE);

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.createDirectory(server.path, body.path);

      if (!result.success) {
        return { status: 200 as const, body: { message: FILE_ERROR_MAP[result.error] || 'Internal server error' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'mkdir',
        resourceType: 'file',
        resourceId: String(params.serverId),
        details: { path: body.path },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Directory created' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  rename: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:write');
      checkRateLimit(`user:${user.sub}:files.rename`, 30, ONE_MINUTE);

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.renameFile(server.path, body.oldPath, body.newPath);

      if (!result.success) {
        return { status: 200 as const, body: { message: FILE_ERROR_MAP[result.error] || 'Internal server error' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'rename',
        resourceType: 'file',
        resourceId: String(params.serverId),
        details: { oldPath: body.oldPath, newPath: body.newPath },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'File renamed' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  info: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'files:read');

      const server = await getServerOrThrow(params.serverId);
      const result = await fileService.getFileInfo(server.path, query.path);

      if (!result.success) {
        return {
          status: 200 as const,
          body: { type: 'file', name: '', size: 0, modified: '' },
        };
      }

      return {
        status: 200 as const,
        body: {
          type: result.data.type,
          name: result.data.name,
          size: result.data.size,
          modified: result.data.modified,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
