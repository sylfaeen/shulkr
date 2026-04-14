import { initServer } from '@ts-rest/fastify';
import path from 'path';
import fs from 'fs/promises';
import { contract } from '@shulkr/shared';
import { modrinthService, type ModrinthVersion } from '@shulkr/backend/services/modrinth_service';
import { hangarService } from '@shulkr/backend/services/hangar_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

function normalizeHangarProject(p: {
  name: string;
  namespace: { owner: string; slug: string };
  description: string;
  stats: { downloads: number; stars: number };
  category: string;
  lastUpdated: string;
  avatarUrl: string;
  settings: { license: { name: string } };
}) {
  return {
    project_id: p.namespace.slug,
    slug: p.namespace.slug,
    title: p.name,
    description: p.description,
    author: p.namespace.owner,
    categories: [p.category],
    versions: [],
    downloads: p.stats.downloads,
    follows: p.stats.stars,
    icon_url: p.avatarUrl || null,
    date_modified: p.lastUpdated,
    license: p.settings.license.name,
  };
}

export const marketplaceRoutes = s.router(contract.marketplace, {
  search: async ({ request, query }) => {
    try {
      await authenticate(request);

      if (query.source === 'hangar') {
        const result = await hangarService.search({ query: query.q, limit: query.limit, offset: query.offset });
        return {
          status: 200 as const,
          body: { hits: result.hits.map(normalizeHangarProject), totalHits: result.totalHits },
        };
      }

      const result = await modrinthService.search({
        query: query.q,
        categories: query.category ? [query.category] : undefined,
        gameVersions: query.gameVersion ? [query.gameVersion] : undefined,
        loaders: query.loader ? [query.loader] : undefined,
        index: query.index,
        limit: query.limit,
        offset: query.offset,
      });

      return {
        status: 200 as const,
        body: { hits: result.hits, totalHits: result.total_hits },
      };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  project: async ({ request, params, query }) => {
    try {
      await authenticate(request);

      if (query.source === 'hangar') {
        const p = await hangarService.getProject(params.idOrSlug);
        return {
          status: 200 as const,
          body: {
            id: p.namespace.slug,
            slug: p.namespace.slug,
            title: p.name,
            description: p.description,
            body: '',
            categories: [p.category, ...p.settings.keywords],
            license: { id: p.settings.license.name, name: p.settings.license.name, url: p.settings.license.url },
            downloads: p.stats.downloads,
            followers: p.stats.stars,
            icon_url: p.avatarUrl || null,
            gallery: [],
            source_url: null,
            wiki_url: null,
            discord_url: null,
            date_created: p.createdAt,
            date_modified: p.lastUpdated,
            game_versions: [],
            loaders: [],
          },
        };
      }

      const project = await modrinthService.getProject(params.idOrSlug);
      return { status: 200 as const, body: project };
    } catch (error) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  versions: async ({ request, params, query }) => {
    try {
      await authenticate(request);

      if (query.source === 'hangar') {
        const { versions: hangarVersions } = await hangarService.getVersions(params.idOrSlug);
        const normalized = hangarVersions.map((v) => {
          const platform = Object.keys(v.downloads)[0] ?? 'PAPER';
          const dl = v.downloads[platform];
          return {
            id: v.name,
            project_id: params.idOrSlug,
            name: v.name,
            version_number: v.name,
            changelog: v.description,
            game_versions: v.platformDependencies?.[platform] ?? [],
            loaders: Object.keys(v.downloads).map((p) => p.toLowerCase()),
            files: dl?.fileInfo
              ? [
                  {
                    hashes: { sha512: dl.fileInfo.sha256Hash, sha1: '' },
                    url: dl.downloadUrl ?? '',
                    filename: dl.fileInfo.name,
                    primary: true,
                    size: dl.fileInfo.sizeBytes,
                  },
                ]
              : [],
            date_published: v.createdAt,
            downloads: v.stats.totalDownloads,
            version_type: (v.channel.name.toLowerCase() === 'release' ? 'release' : 'beta') as 'release' | 'beta' | 'alpha',
          };
        });
        return { status: 200 as const, body: normalized };
      }

      const versions = await modrinthService.getVersions(params.idOrSlug, {
        gameVersions: query.gameVersion ? [query.gameVersion] : undefined,
        loaders: query.loader ? [query.loader] : undefined,
      });

      return { status: 200 as const, body: versions };
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
      assertPermissions(user, 'server:plugins:list');

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

      const metaFiles = files.filter((f) => f.endsWith('.marketplace') || f.endsWith('.modrinth'));
      type UpdateInfo = {
        filename: string;
        source: 'modrinth' | 'hangar';
        projectId: string;
        currentVersionId: string;
        latestVersion: ModrinthVersion;
      };
      const updates: Array<UpdateInfo> = [];

      for (const metaFile of metaFiles) {
        try {
          const content = await fs.readFile(path.join(pluginsDir, metaFile), 'utf-8');
          const meta = JSON.parse(content) as { source?: 'modrinth' | 'hangar'; projectId: string; versionId: string };
          const metaSource = meta.source ?? 'modrinth';
          const pluginFilename = metaFile.replace(/\.(marketplace|modrinth)$/, '');

          if (metaSource === 'modrinth') {
            const versions = await modrinthService.getVersions(meta.projectId);
            if (versions.length === 0) continue;
            const latest = versions[0];
            if (latest.id !== meta.versionId) {
              updates.push({
                filename: pluginFilename,
                source: 'modrinth',
                projectId: meta.projectId,
                currentVersionId: meta.versionId,
                latestVersion: latest,
              });
            }
          } else if (metaSource === 'hangar') {
            const { versions } = await hangarService.getVersions(meta.projectId, { limit: 1 });
            if (versions.length === 0) continue;
            const latest = versions[0];
            if (latest.name !== meta.versionId) {
              // Normalize Hangar version to Modrinth format for the response
              const platform = Object.keys(latest.downloads)[0] ?? 'PAPER';
              const dl = latest.downloads[platform];
              updates.push({
                filename: pluginFilename,
                source: 'hangar',
                projectId: meta.projectId,
                currentVersionId: meta.versionId,
                latestVersion: {
                  id: String(latest.id),
                  project_id: meta.projectId,
                  name: latest.name,
                  version_number: latest.name,
                  changelog: latest.description,
                  game_versions: latest.platformDependencies?.[platform] ?? [],
                  loaders: Object.keys(latest.downloads).map((p) => p.toLowerCase()),
                  files: dl?.fileInfo
                    ? [
                        {
                          hashes: { sha512: dl.fileInfo.sha256Hash, sha1: '' },
                          url: dl.downloadUrl ?? '',
                          filename: dl.fileInfo.name,
                          primary: true,
                          size: dl.fileInfo.sizeBytes,
                        },
                      ]
                    : [],
                  date_published: latest.createdAt,
                  downloads: latest.stats.totalDownloads,
                  version_type: latest.channel.name.toLowerCase() === 'release' ? 'release' : 'beta',
                },
              });
            }
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
      assertPermissions(user, 'server:plugins:marketplace');
      checkRateLimit(`marketplace-install:${user.sub}`, 10, ONE_MINUTE);

      const server = await serverService.getServerById(params.serverId);
      if (!server) {
        return { status: 403 as const, body: { code: 'NOT_FOUND', message: 'Server not found' } };
      }

      const pluginsDir = path.join(server.path, 'plugins');

      let result: { filename: string; path: string };
      if (body.source === 'hangar') {
        result = await hangarService.downloadPlugin(body.projectId, body.versionId, 'PAPER', pluginsDir);
      } else {
        result = await modrinthService.downloadPlugin(body.fileUrl, pluginsDir, body.filename, body.fileHash);
      }

      // Write .marketplace metadata file
      const metaPath = path.join(pluginsDir, `${result.filename}.marketplace`);
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          source: body.source,
          projectId: body.projectId,
          versionId: body.versionId,
          installedAt: new Date().toISOString(),
        }),
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
