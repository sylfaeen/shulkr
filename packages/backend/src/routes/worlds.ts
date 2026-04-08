import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import { worldService } from '@shulkr/backend/services/world_service';
import { auditService } from '@shulkr/backend/services/audit_service';

export async function worldRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/:serverId/worlds/import',
    async (
      request: FastifyRequest<{
        Params: { serverId: string };
        Querystring: { name?: string };
      }>,
      reply: FastifyReply
    ) => {
      let user: { sub: number; username: string; permissions: Array<string> };
      try {
        user = await request.jwtVerify();
      } catch {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token' });
      }

      if (!user.permissions.includes('*') && !user.permissions.includes('server:general')) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ code: 'NO_FILE', message: 'No file uploaded' });
      }

      const worldName = request.query.name || file.filename.replace(/\.zip$/i, '');

      // Save to temp
      const tmpDir = path.join(os.tmpdir(), `shulkr-world-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpZip = path.join(tmpDir, 'world.zip');

      try {
        const chunks: Array<Buffer> = [];
        for await (const chunk of file.file) {
          chunks.push(chunk as Buffer);
        }
        await fs.writeFile(tmpZip, Buffer.concat(chunks));

        // Extract
        const extractDir = path.join(tmpDir, 'extracted');
        await fs.mkdir(extractDir, { recursive: true });
        execSync(`unzip -o -q "${tmpZip}" -d "${extractDir}"`);

        // Find level.dat — could be at root or in a single subdirectory
        let worldRoot = extractDir;
        if (!existsSync(path.join(extractDir, 'level.dat'))) {
          const entries = await fs.readdir(extractDir, { withFileTypes: true });
          const dirs = entries.filter((e) => e.isDirectory());
          if (dirs.length === 1 && existsSync(path.join(extractDir, dirs[0].name, 'level.dat'))) {
            worldRoot = path.join(extractDir, dirs[0].name);
          } else {
            return reply.status(400).send({ code: 'INVALID_WORLD', message: 'No level.dat found in ZIP' });
          }
        }

        const result = await worldService.importWorld(request.params.serverId, worldName, worldRoot);
        if (!result.success) {
          return reply.status(400).send({ code: 'IMPORT_FAILED', message: result.error ?? 'Import failed' });
        }

        await auditService.log({
          userId: user.sub,
          username: user.username,
          action: 'import_world',
          resourceType: 'world',
          resourceId: request.params.serverId,
          details: { worldName },
          ip: request.ip,
        });

        return reply.status(200).send({ message: 'World imported successfully', worldName });
      } finally {
        // Cleanup temp
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  );
}
