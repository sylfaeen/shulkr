import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { ServerService } from '@shulkr/backend/services/server_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { parseArchiveLogLines } from '@shulkr/backend/lib/log_parser';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;
const gunzip = promisify(zlib.gunzip);

const MAX_LINES = 50_000;

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 404, body: { code: 'SERVER_NOT_FOUND', message: 'Server not found' } };
  return server;
}

export const logsRoutes = s.router(contract.logs, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:files:read:logs');

      const server = await getServerOrThrow(params.serverId);
      const logsDir = path.join(server.path, 'logs');
      const files: Array<{ filename: string; size: number; modified: string; isLatest: boolean }> = [];

      // Check latest.log
      const latestPath = path.join(server.path, 'logs', 'latest.log');
      if (fs.existsSync(latestPath)) {
        const stat = fs.statSync(latestPath);
        files.push({ filename: 'latest.log', size: stat.size, modified: stat.mtime.toISOString(), isLatest: true });
      }

      // List .log.gz archives
      if (fs.existsSync(logsDir)) {
        const entries = fs.readdirSync(logsDir);
        for (const entry of entries) {
          if (!entry.endsWith('.log.gz')) continue;
          const filePath = path.join(logsDir, entry);
          const stat = fs.statSync(filePath);
          files.push({ filename: entry, size: stat.size, modified: stat.mtime.toISOString(), isLatest: false });
        }
      }

      // Sort: latest first, then archives by date descending
      files.sort((a, b) => {
        if (a.isLatest) return -1;
        if (b.isLatest) return 1;
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      });

      return { status: 200 as const, body: files };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  read: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:files:read:logs');

      const server = await getServerOrThrow(params.serverId);
      const filename = path.basename(query.filename);

      // Validate filename to prevent path traversal
      if (filename !== query.filename || filename.includes('..')) {
        throw { status: 403 as const, body: { code: 'INVALID_FILENAME', message: 'Invalid filename' } };
      }

      let filePath: string;
      if (filename === 'latest.log') {
        filePath = path.join(server.path, 'logs', 'latest.log');
      } else if (filename.endsWith('.log.gz')) {
        filePath = path.join(server.path, 'logs', filename);
      } else {
        throw { status: 404 as const, body: { code: 'FILE_NOT_FOUND', message: 'Invalid log file' } };
      }

      if (!fs.existsSync(filePath)) {
        return { status: 404 as const, body: { code: 'FILE_NOT_FOUND', message: 'Log file not found' } };
      }

      let content: string;
      if (filename.endsWith('.log.gz')) {
        const compressed = fs.readFileSync(filePath);
        const decompressed = await gunzip(compressed);
        content = decompressed.toString('utf-8');
      } else {
        content = fs.readFileSync(filePath, 'utf-8');
      }

      const lines = parseArchiveLogLines(content, MAX_LINES);

      return {
        status: 200 as const,
        body: { filename, lines, totalLines: lines.length },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:files:read:logs');
      checkRateLimit(`user:${user.sub}:logs.delete`, 50, ONE_MINUTE);

      const server = await getServerOrThrow(params.serverId);
      const filename = path.basename(params.filename);

      if (filename !== params.filename || filename.includes('..')) {
        throw { status: 403 as const, body: { code: 'INVALID_FILENAME', message: 'Invalid filename' } };
      }

      if (!filename.endsWith('.log.gz')) {
        return { status: 403 as const, body: { code: 'INVALID_FILENAME', message: 'Only archived log files can be deleted' } };
      }

      const filePath = path.join(server.path, 'logs', filename);

      if (!fs.existsSync(filePath)) {
        return { status: 404 as const, body: { code: 'FILE_NOT_FOUND', message: 'Log file not found' } };
      }

      fs.unlinkSync(filePath);

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete_log_archive',
        resourceType: 'log',
        details: { filename, serverId: params.serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Log archive deleted successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
