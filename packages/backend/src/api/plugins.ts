import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { fileService } from '@shulkr/backend/services/file_service';
import { serverService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const PLUGINS_FOLDER = 'plugins';
const ONE_MINUTE = 60_000;

type PluginYml = {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  authors?: Array<string>;
};

type MarketplaceMeta = {
  source: 'modrinth' | 'hangar';
  projectId: string;
  versionId: string;
  installedAt: string;
};

function extractPluginMetadata(jarPath: string): { version: string | null; description: string | null; authors: Array<string> } {
  try {
    const zip = new AdmZip(jarPath);
    const entry = zip.getEntry('plugin.yml') ?? zip.getEntry('paper-plugin.yml');
    if (!entry) return { version: null, description: null, authors: [] };

    const content = entry.getData().toString('utf-8');
    const parsed = yaml.load(content) as PluginYml;

    const authors: Array<string> = [];
    if (parsed.authors && Array.isArray(parsed.authors)) {
      authors.push(...parsed.authors.map(String));
    } else if (parsed.author) {
      authors.push(String(parsed.author));
    }

    return {
      version: parsed.version ? String(parsed.version) : null,
      description: parsed.description ? String(parsed.description) : null,
      authors,
    };
  } catch {
    return { version: null, description: null, authors: [] };
  }
}

async function readMarketplaceMeta(pluginsDir: string, filename: string): Promise<MarketplaceMeta | null> {
  try {
    // Try unified .marketplace format first, then legacy .modrinth
    for (const ext of ['.marketplace', '.modrinth']) {
      try {
        const metaPath = path.join(pluginsDir, `${filename}${ext}`);
        const content = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(content) as MarketplaceMeta;
        if (!meta.source) meta.source = 'modrinth'; // Legacy .modrinth files
        return meta;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };
  return server;
}

export const pluginsRoutes = s.router(contract.plugins, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins:list');

      const serverId = params.serverId;
      const server = await getServerOrThrow(serverId);

      const result = await fileService.listDirectory(server.path, PLUGINS_FOLDER);

      if (!result.success) {
        if (result.error === ErrorCodes.FILE_NOT_FOUND) {
          return { status: 200 as const, body: { plugins: [] } };
        }
        return { status: 200 as const, body: { plugins: [] } };
      }

      const jarFiles = result.data.filter(
        (file) => file.type === 'file' && (file.name.endsWith('.jar') || file.name.endsWith('.jar_'))
      );

      const pluginsDir = path.join(server.path, PLUGINS_FOLDER);

      const plugins = await Promise.all(
        jarFiles.map(async (file) => {
          const enabled = file.name.endsWith('.jar');
          const jarPath = path.join(pluginsDir, file.name);
          const metadata = extractPluginMetadata(jarPath);
          const marketplace = await readMarketplaceMeta(pluginsDir, file.name);

          return {
            name: enabled ? file.name : file.name.slice(0, -1),
            filename: file.name,
            enabled,
            size: file.size,
            modified: file.modified,
            version: metadata.version,
            description: metadata.description,
            authors: metadata.authors,
            marketplaceSource: marketplace?.source ?? null,
            marketplaceProjectId: marketplace?.projectId ?? null,
            marketplaceVersionId: marketplace?.versionId ?? null,
          };
        })
      );

      return { status: 200 as const, body: { plugins } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  toggle: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:plugins:toggle');
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

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'toggle',
        resourceType: 'plugin',
        resourceId: serverId,
        details: { filename: body.filename, enabled: !isDisabled },
        ip: request.ip,
      });

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
      assertPermissions(user, 'server:plugins:delete');
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

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'plugin',
        resourceId: serverId,
        details: { filename },
        ip: request.ip,
      });

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
