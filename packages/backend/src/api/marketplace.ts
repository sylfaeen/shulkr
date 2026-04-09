import { initServer } from '@ts-rest/fastify';
import path from 'path';
import fs from 'fs/promises';
import { contract } from '@shulkr/shared';
import { modrinthService, type ModrinthVersion } from '@shulkr/backend/services/modrinth_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

export const marketplaceRoutes = s.router(contract.marketplace, {
  search: async ({ request, query }) => {
    try {
      await authenticate(request);

      const result = await modrinthService.search({
        query: query.q,
        categories: query.category ? [query.category] : undefined,
        gameVersions: query.gameVersion ? [query.gameVersion] : undefined,
        loaders: query.loader ? [query.loader] : undefined,
        limit: query.limit,
        offset: query.offset,
      });

      return {
        status: 200 as const,
        body: {
          hits: result.hits,
          totalHits: result.total_hits,
        },
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  project: async ({ request, params }) => {
    try {
      await authenticate(request);

      const project = await modrinthService.getProject(params.idOrSlug);

      return {
        status: 200 as const,
        body: project,
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  versions: async ({ request, params, query }) => {
    try {
      await authenticate(request);

      const versions = await modrinthService.getVersions(params.idOrSlug, {
        gameVersions: query.gameVersion ? [query.gameVersion] : undefined,
        loaders: query.loader ? [query.loader] : undefined,
      });

      return {
        status: 200 as const,
        body: versions,
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  categories: async ({ request }) => {
    try {
      await authenticate(request);

      const categories = await modrinthService.getCategories();

      return {
        status: 200 as const,
        body: categories,
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  updates: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins');

      const server = await serverService.getServerById(params.serverId);
      if (!server) {
        return { status: 403 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const pluginsDir = path.join(server.path, 'plugins');
      let files: Array<string>;
      try {
        files = await fs.readdir(pluginsDir);
      } catch {
        return { status: 200 as const, body: [] };
      }

      const modrinthFiles = files.filter((f) => f.endsWith('.modrinth'));
      type UpdateInfo = {
        filename: string;
        projectId: string;
        currentVersionId: string;
        latestVersion: ModrinthVersion;
      };
      const updates: Array<UpdateInfo> = [];

      for (const metaFile of modrinthFiles) {
        try {
          const content = await fs.readFile(path.join(pluginsDir, metaFile), 'utf-8');
          const meta = JSON.parse(content) as { projectId: string; versionId: string };
          const pluginFilename = metaFile.replace('.modrinth', '');

          const versions = await modrinthService.getVersions(meta.projectId);
          if (versions.length === 0) continue;

          const latest = versions[0];
          if (latest.id !== meta.versionId) {
            updates.push({
              filename: pluginFilename,
              projectId: meta.projectId,
              currentVersionId: meta.versionId,
              latestVersion: latest,
            });
          }
        } catch {
          // Skip unreadable metadata
        }
      }

      return { status: 200 as const, body: updates };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  install: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins');
      checkRateLimit(`marketplace-install:${user.sub}`, 10, ONE_MINUTE);

      const server = await serverService.getServerById(params.serverId);
      if (!server) {
        return { status: 403 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const pluginsDir = path.join(server.path, 'plugins');

      const result = await modrinthService.downloadPlugin(body.fileUrl, pluginsDir, body.filename, body.fileHash);

      // Write .modrinth metadata file
      const metaPath = path.join(pluginsDir, `${result.filename}.modrinth`);
      await fs.writeFile(
        metaPath,
        JSON.stringify({ projectId: body.projectId, versionId: body.versionId, installedAt: new Date().toISOString() }),
        'utf-8'
      );

      auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'plugin:install',
        resourceType: 'server',
        resourceId: params.serverId,
        details: { filename: result.filename, projectId: body.projectId, versionId: body.versionId, source: 'modrinth' },
        ip: request.ip,
      });

      return {
        status: 200 as const,
        body: {
          filename: result.filename,
          message: `Plugin ${result.filename} installed successfully`,
        },
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
