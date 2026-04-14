import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { paperMCService } from '@shulkr/backend/services/papermc_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { fileService } from '@shulkr/backend/services/file_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

const downloadProgress = new Map<string, { percentage: number; filename: string }>();

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };
  return server;
}

type JarSource = 'papermc' | 'spigot' | 'purpur' | 'fabric' | 'forge' | 'vanilla' | 'custom';

function detectJarSource(filename: string): JarSource {
  if (/-custom\.jar$/i.test(filename)) return 'custom';
  if (/^paper-[\d.]+-\d+\.jar$/i.test(filename)) return 'papermc';
  if (/^spigot-[\d.]+\.jar$/i.test(filename)) return 'spigot';
  if (/^purpur-[\d.]+-\d+\.jar$/i.test(filename)) return 'purpur';
  if (/^fabric-server/i.test(filename)) return 'fabric';
  if (/^forge-[\d.]+-[\d.]+/i.test(filename)) return 'forge';
  if (/^(server|minecraft_server)[\d.]*\.jar$/i.test(filename)) return 'vanilla';
  return 'custom';
}

export const jarsRoutes = s.router(contract.jars, {
  getVersions: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:list');

      const versions = await paperMCService.getVersions(query.project);
      return { status: 200 as const, body: { versions } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  getBuilds: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:list');

      const builds = await paperMCService.getBuilds(query.project, query.version);
      return { status: 200 as const, body: { builds } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  download: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:download');
      checkRateLimit(`user:${user.sub}:jars.download`, 5, ONE_MINUTE);

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);
      const targetBuild = body.build || 0;

      downloadProgress.set(serverId, { percentage: 0, filename: '' });

      const result = await paperMCService.downloadJar(body.project, body.version, targetBuild, server.path, (progress) => {
        downloadProgress.set(serverId, {
          percentage: progress.percentage,
          filename: downloadProgress.get(serverId)?.filename || '',
        });
      });

      downloadProgress.delete(serverId);

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'download',
        resourceType: 'jar',
        resourceId: serverId,
        details: { filename: result.filename, project: body.project, version: body.version, build: targetBuild },
        ip: request.ip,
      });

      return {
        status: 200 as const,
        body: {
          filename: result.filename,
          version: body.version,
          build: targetBuild,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  progress: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:list');

      const serverId = params.serverId;
      return { status: 200 as const, body: downloadProgress.get(serverId) || null };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:list');

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);

      const result = await fileService.listDirectory(server.path, '/');

      if (!result.success) {
        return { status: 200 as const, body: { jars: [], activeJar: server.jar_file } };
      }

      const jars = result.data
        .filter((file) => file.type === 'file' && file.name.endsWith('.jar'))
        .map((file) => ({
          name: file.name,
          size: file.size,
          modified: file.modified,
          isActive: file.name === server.jar_file,
          source: detectJarSource(file.name),
        }));

      return {
        status: 200 as const,
        body: {
          jars,
          activeJar: server.jar_file,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  setActive: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:activate');
      checkRateLimit(`user:${user.sub}:jars.setActive`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);

      const fileInfo = await fileService.getFileInfo(server.path, body.jarFile);
      if (!fileInfo.success) {
        return { status: 200 as const, body: { jarFile: '' } };
      }

      await serverService.updateServer(serverId, {
        jar_file: body.jarFile,
      });

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'set_active',
        resourceType: 'jar',
        resourceId: serverId,
        details: { jarFile: body.jarFile },
        ip: request.ip,
      });

      return { status: 200 as const, body: { jarFile: body.jarFile } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jars:delete');
      checkRateLimit(`user:${user.sub}:jars.delete`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);
      const jarFile = params.jarFile;

      if (server.jar_file === jarFile) {
        return { status: 200 as const, body: { deleted: '' } };
      }

      const fileInfo = await fileService.getFileInfo(server.path, jarFile);
      if (!fileInfo.success) {
        return { status: 200 as const, body: { deleted: '' } };
      }

      const result = await fileService.deleteFile(server.path, jarFile);
      if (!result.success) {
        return { status: 200 as const, body: { deleted: '' } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'jar',
        resourceId: serverId,
        details: { jarFile },
        ip: request.ip,
      });

      return { status: 200 as const, body: { deleted: jarFile } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
