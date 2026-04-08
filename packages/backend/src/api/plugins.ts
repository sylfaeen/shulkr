import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { fileService } from '@shulkr/backend/services/file_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const PLUGINS_FOLDER = 'plugins';
const ONE_MINUTE = 60_000;

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };
  return server;
}

export const pluginsRoutes = s.router(contract.plugins, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins');

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);

      const result = await fileService.listDirectory(server.path, PLUGINS_FOLDER);

      if (!result.success) {
        if (result.error === ErrorCodes.FILE_NOT_FOUND) {
          return { status: 200 as const, body: { plugins: [] } };
        }
        return { status: 200 as const, body: { plugins: [] } };
      }

      const plugins = result.data
        .filter((file) => file.type === 'file' && (file.name.endsWith('.jar') || file.name.endsWith('.jar_')))
        .map((file) => {
          const enabled = file.name.endsWith('.jar');
          return {
            name: enabled ? file.name : file.name.slice(0, -1),
            filename: file.name,
            enabled,
            size: file.size,
            modified: file.modified,
            version: null,
            description: null,
            authors: [] as Array<string>,
          };
        });

      return { status: 200 as const, body: { plugins } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  toggle: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins');
      checkRateLimit(`user:${user.sub}:plugins.toggle`, 100, ONE_MINUTE);

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);

      const isDisabled = body.filename.endsWith('.jar_');
      const oldPath = `${PLUGINS_FOLDER}/${body.filename}`;
      const newFilename = isDisabled ? body.filename.slice(0, -1) : `${body.filename}_`;
      const newPath = `${PLUGINS_FOLDER}/${newFilename}`;

      const result = await fileService.renameFile(server.path, oldPath, newPath);

      if (!result.success) {
        if (result.error === ErrorCodes.FILE_NOT_FOUND) {
          return { status: 200 as const, body: { name: body.filename, enabled: false, message: 'Plugin not found' } };
        }
        return { status: 200 as const, body: { name: body.filename, enabled: false, message: 'Failed to toggle plugin' } };
      }

      return {
        status: 200 as const,
        body: {
          name: newFilename,
          enabled: !isDisabled,
          message: 'Plugin toggled. Server restart may be required.',
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins');
      checkRateLimit(`user:${user.sub}:plugins.delete`, 100, ONE_MINUTE);

      const serverId = params.serverId;
      const filename = params.filename;

      if (!filename.endsWith('.jar') && !filename.endsWith('.jar_')) {
        return { status: 200 as const, body: { name: filename, message: 'Invalid plugin filename' } };
      }

      const server = await getServerOrThrow(serverId);

      const filePath = `${PLUGINS_FOLDER}/${filename}`;
      const result = await fileService.deleteFile(server.path, filePath);

      if (!result.success) {
        if (result.error === ErrorCodes.FILE_NOT_FOUND) {
          return { status: 200 as const, body: { name: filename, message: 'Plugin not found' } };
        }
        return { status: 200 as const, body: { name: filename, message: 'Failed to delete plugin' } };
      }

      return {
        status: 200 as const,
        body: {
          name: filename,
          message: 'Plugin deleted. Server restart may be required.',
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
