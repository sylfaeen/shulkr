import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes, PUBLIC_FILE_CHUNK_BYTES } from '@shulkr/shared';
import {
  cancelPublicFileUpload,
  completePublicFileUpload,
  deletePublicFile,
  getPublicFileUsage,
  listPublicFiles,
  openPublicFileUpload,
  rotatePublicFileToken,
  updatePublicFile,
} from '@shulkr/backend/services/public_file_service';
import { getPanelDomain } from '@shulkr/backend/services/domain_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();
const ONE_MINUTE = 60_000;

const notFound = { status: 404 as const, body: { code: ErrorCodes.PUBLIC_FILE_NOT_FOUND, message: 'File not found' } };

const uploadNotFound = {
  status: 404 as const,
  body: { code: ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND, message: 'Upload not found' },
};

function mapUploadError(error: unknown) {
  if (!(error instanceof Error)) return null;

  switch (error.message) {
    case ErrorCodes.PUBLIC_FILE_TOO_LARGE:
      return { status: 400 as const, body: { code: error.message, message: 'The file exceeds the size limit' } };
    case ErrorCodes.PUBLIC_FILE_UPLOAD_INCOMPLETE:
      return { status: 400 as const, body: { code: error.message, message: 'The upload is not complete' } };
    case ErrorCodes.PUBLIC_FILE_UPLOAD_LIMIT:
      return { status: 429 as const, body: { code: error.message, message: 'Too many uploads in progress' } };
    case ErrorCodes.PUBLIC_FILE_QUOTA_EXCEEDED:
      return { status: 507 as const, body: { code: error.message, message: 'The storage quota for shared files is reached' } };
    case ErrorCodes.PUBLIC_FILE_DISK_FULL:
      return { status: 507 as const, body: { code: error.message, message: 'Not enough free disk space' } };
    case ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND:
      return uploadNotFound;
    case ErrorCodes.PUBLIC_FILE_NOT_FOUND:
      return notFound;
    default:
      return null;
  }
}

// The panel domain is the address visitors should use whenever one is configured. Without it the backend cannot know the reachable address (NAT, several interfaces), so the frontend falls back to the origin the administrator is using.
async function resolveBaseUrl(deps: AppDeps): Promise<string | null> {
  const domain = await getPanelDomain(deps);
  if (!domain) return null;

  return `${domain.ssl_enabled ? 'https' : 'http'}://${domain.domain}`;
}

export function createPublicFilesRoutes(deps: AppDeps) {
  return s.router(contract.publicFiles, {
    list: async ({ request }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:list');

        return {
          status: 200 as const,
          body: {
            files: await listPublicFiles(deps),
            baseUrl: await resolveBaseUrl(deps),
            usedBytes: await getPublicFileUsage(deps),
            quotaBytes: deps.config.PUBLIC_FILES_MAX_TOTAL_BYTES,
          },
        };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    createUpload: async ({ request, body }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:upload');
        checkRateLimit(`user:${user.sub}:publicFiles.createUpload`, 20, ONE_MINUTE);

        const { uploadId } = await openPublicFileUpload(deps, { userId: user.sub, ...body });

        return { status: 201 as const, body: { uploadId, chunkBytes: PUBLIC_FILE_CHUNK_BYTES } };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        const mapped = mapUploadError(error);
        if (mapped && mapped.status !== 404) return mapped;
        throw error;
      }
    },

    replace: async ({ request, params, body }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:upload', 'shares:files:manage');
        checkRateLimit(`user:${user.sub}:publicFiles.createUpload`, 20, ONE_MINUTE);

        const { uploadId } = await openPublicFileUpload(deps, {
          userId: user.sub,
          name: body.name,
          sizeBytes: body.sizeBytes,
          expiresInHours: null,
          maxDownloads: null,
          replacesFileId: params.id,
        });

        return { status: 201 as const, body: { uploadId, chunkBytes: PUBLIC_FILE_CHUNK_BYTES } };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        const mapped = mapUploadError(error);
        if (mapped && mapped !== uploadNotFound) return mapped;
        throw error;
      }
    },

    cancelUpload: async ({ request, params }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:upload');

        const cancelled = await cancelPublicFileUpload(deps, { uploadId: params.id, userId: user.sub });
        if (!cancelled) return uploadNotFound;

        return { status: 200 as const, body: { message: 'Upload cancelled' } };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    completeUpload: async ({ request, params }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:upload');

        const { file, row, replaced } = await completePublicFileUpload(deps, { uploadId: params.id, userId: user.sub });

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: replaced ? 'public_file_replace' : 'public_file_upload',
          resourceType: 'public_file',
          resourceId: String(file.id),
          details: { name: file.name, size: file.sizeBytes, mimeType: file.mimeType, sha256: row.sha256 },
          ip: request.ip,
        });

        return { status: 201 as const, body: file };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        const mapped = mapUploadError(error);
        if (mapped && (mapped.status === 400 || mapped.status === 404)) return mapped;
        throw error;
      }
    },

    update: async ({ request, params, body }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:manage');

        const file = await updatePublicFile(deps, params.id, body);
        if (!file) return notFound;

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'public_file_update',
          resourceType: 'public_file',
          resourceId: String(file.id),
          details: { name: file.name, expiresAt: file.expiresAt ?? 'never', maxDownloads: file.maxDownloads ?? 'unlimited' },
          ip: request.ip,
        });

        return { status: 200 as const, body: file };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    rotate: async ({ request, params }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:manage');
        checkRateLimit(`user:${user.sub}:publicFiles.rotate`, 20, ONE_MINUTE);

        const file = await rotatePublicFileToken(deps, params.id);
        if (!file) return notFound;

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'public_file_rotate',
          resourceType: 'public_file',
          resourceId: String(file.id),
          details: { name: file.name },
          ip: request.ip,
        });

        return { status: 200 as const, body: file };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },

    remove: async ({ request, params }) => {
      try {
        const user = await authenticate(request);
        assertPermissions(user, 'shares:files:manage');

        const deleted = await deletePublicFile(deps, params.id);
        if (!deleted) return notFound;

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'public_file_delete',
          resourceType: 'public_file',
          resourceId: String(deleted.id),
          details: { name: deleted.original_name, downloads: deleted.download_count },
          ip: request.ip,
        });

        return { status: 200 as const, body: { message: 'File deleted' } };
      } catch (error: unknown) {
        if (isMiddlewareError(error)) return error;
        throw error;
      }
    },
  });
}
