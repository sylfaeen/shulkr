import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  createPublicFileUploadSchema,
  publicFileSchema,
  replacePublicFileSchema,
  updatePublicFileSchema,
} from '@shulkr/shared/schemas/public_file';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

const idParams = z.object({ id: z.coerce.number().int() });

export const publicFilesContract = c.router({
  list: {
    method: 'GET',
    path: '/api/public-files',
    responses: {
      200: z.object({
        files: z.array(publicFileSchema),
        baseUrl: z.string().nullable(),
        usedBytes: z.number(),
        quotaBytes: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  createUpload: {
    method: 'POST',
    path: '/api/public-files/uploads',
    body: createPublicFileUploadSchema,
    responses: {
      201: z.object({
        uploadId: z.string(),
        chunkBytes: z.number(),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
      507: errorSchema,
    },
  },
  replace: {
    method: 'POST',
    path: '/api/public-files/:id/replace',
    pathParams: idParams,
    body: replacePublicFileSchema,
    responses: {
      201: z.object({
        uploadId: z.string(),
        chunkBytes: z.number(),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
      507: errorSchema,
    },
  },
  cancelUpload: {
    method: 'DELETE',
    path: '/api/public-files/uploads/:id',
    pathParams: z.object({ id: z.string() }),
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  completeUpload: {
    method: 'POST',
    path: '/api/public-files/uploads/:id/complete',
    pathParams: z.object({ id: z.string() }),
    body: null,
    responses: {
      201: publicFileSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/public-files/:id',
    pathParams: idParams,
    body: updatePublicFileSchema,
    responses: {
      200: publicFileSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  rotate: {
    method: 'POST',
    path: '/api/public-files/:id/rotate',
    pathParams: idParams,
    body: null,
    responses: {
      200: publicFileSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
  remove: {
    method: 'DELETE',
    path: '/api/public-files/:id',
    pathParams: idParams,
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
});
