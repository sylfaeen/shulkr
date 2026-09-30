import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes, PUBLIC_FILE_CHUNK_BYTES } from '@shulkr/shared';
import type { PublicFileRow } from '@shulkr/backend/db/schema';
import {
  appendPublicFileChunk,
  consumePublicFileDownload,
  resolvePublicFile,
} from '@shulkr/backend/services/public_file_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

// Sent on every public response, success and 404 alike, so the headers themselves say nothing about whether a token exists. Even if a browser renders the body as a document, the sandbox leaves it without scripts, forms or access to the panel origin.
const PUBLIC_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// RFC 6266 with an RFC 5987 extended parameter: the quoted ASCII fallback keeps old clients working, filename* carries the real UTF-8 name.
function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function sendNotFound(reply: FastifyReply) {
  return reply.code(404).headers(PUBLIC_HEADERS).type('application/json').send({ error: 'Not found' });
}

function setFileHeaders(reply: FastifyReply, row: PublicFileRow): void {
  reply.headers(PUBLIC_HEADERS);
  reply.header('Content-Type', row.mime_type);
  reply.header('Content-Length', row.size_bytes);
  reply.header('Content-Disposition', contentDisposition(row.disposition, row.original_name));
  // Images may be embedded from other sites (a forum post, a Discord preview); nothing else needs to be loadable cross-origin.
  if (row.disposition === 'inline') reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
}

export async function publicFileChunkRoute(fastify: FastifyInstance) {
  // Scoped to this plugin: nowhere else in the API accepts a raw binary body.
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: PUBLIC_FILE_CHUNK_BYTES },
    (_request, body, done) => {
      done(null, body);
    }
  );

  // PUT /api/public-files/uploads/:id/chunks?offset=N Appends one chunk of a chunked upload. Chunks keep every request under the panel vhost body limit, so a 2 GB file never needs an nginx change.
  fastify.put(
    '/uploads/:id/chunks',
    { bodyLimit: PUBLIC_FILE_CHUNK_BYTES },
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { offset?: string }; Body: Buffer }>,
      reply: FastifyReply
    ) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:upload');
        checkRateLimit(`user:${user.sub}:publicFiles.chunk`, 120, 60_000);

        const offset = Number(request.query.offset);

        if (!Buffer.isBuffer(request.body) || !/^\d+$/.test(request.query.offset ?? '')) {
          return reply.status(400).send({ code: ErrorCodes.PUBLIC_FILE_CHUNK_INVALID, message: 'Invalid chunk' });
        }

        const result = await appendPublicFileChunk(getAppDeps(), {
          uploadId: request.params.id,
          userId: user.sub,
          offset,
          chunk: request.body,
        });

        return reply.status(200).send(result);
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return reply.status(error.status).send(error.body);

        if (error instanceof Error && error.message === ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND) {
          return reply.status(404).send({ code: error.message, message: 'Upload not found' });
        }

        if (error instanceof Error && error.message === ErrorCodes.PUBLIC_FILE_CHUNK_INVALID) {
          return reply.status(409).send({ code: error.message, message: 'Chunk does not match the upload state' });
        }

        throw error;
      }
    }
  );
}

export async function publicFileRoute(fastify: FastifyInstance) {
  // GET /f/:token Unauthenticated. The token is the only input and only selects a row by its hash; the disk path comes from that row. Malformed, unknown, expired, exhausted or missing: one identical 404.
  fastify.get(
    '/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const deps = getAppDeps();
      const resolved = await resolvePublicFile(deps, request.params.token);

      if (!resolved) return sendNotFound(reply);

      const { row, filePath } = resolved;

      // A HEAD (link preview, curl -I) describes the file without consuming a download. Fastify's HEAD handling discards the stream and keeps the headers, Content-Length included.
      if (request.method === 'HEAD') {
        setFileHeaders(reply, row);

        return reply.send(deps.fs.createReadStream(filePath));
      }

      if (!(await consumePublicFileDownload(deps, row.id, request.ip))) return sendNotFound(reply);

      await logAuditAction(deps, {
        userId: null,
        username: null,
        action: 'public_file_download',
        resourceType: 'public_file',
        resourceId: String(row.id),
        details: { name: row.original_name },
        ip: request.ip,
      });

      setFileHeaders(reply, row);

      // Streamed as stored, never transcoded, so the client receives exactly the bytes whose SHA-1 the panel shows.
      return reply.send(deps.fs.createReadStream(filePath));
    }
  );
}
