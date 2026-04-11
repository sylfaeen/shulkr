import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { serverResponseSchema, createServerSchema, updateServerSchema } from '../schemas/server';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

const backupInfoSchema = z.object({
  filename: z.string(),
  path: z.string(),
  size: z.number(),
});

export const serversContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers',
    responses: {
      200: z.array(serverResponseSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  byId: {
    method: 'GET',
    path: '/api/servers/:id',
    responses: {
      200: serverResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/servers',
    body: createServerSchema,
    responses: {
      201: serverResponseSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      429: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/servers/:id',
    body: updateServerSchema,
    responses: {
      200: serverResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      409: errorSchema,
      429: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:id',
    body: null,
    query: z.object({
      createBackup: z.coerce.boolean().optional(),
    }),
    responses: {
      200: z.object({
        message: z.string(),
        backup: backupInfoSchema.optional(),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      409: errorSchema,
      429: errorSchema,
      500: errorSchema,
    },
  },
  listBackups: {
    method: 'GET',
    path: '/api/servers/:id/backups',
    responses: {
      200: z.array(
        z.object({
          filename: z.string(),
          size: z.number(),
          created: z.string(),
          status: z.enum(['creating', 'ready']).optional(),
          progress: z.number().optional(),
        })
      ),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  renameBackup: {
    method: 'PATCH',
    path: '/api/servers/backups/:filename',
    body: z.object({
      newFilename: z.string().min(1),
    }),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  deleteBackup: {
    method: 'DELETE',
    path: '/api/servers/backups/:filename',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  backup: {
    method: 'POST',
    path: '/api/servers/:id/backup',
    body: z.object({
      paths: z.array(z.string()).optional(),
    }),
    responses: {
      200: z.object({
        message: z.string(),
        backup: backupInfoSchema.optional(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  start: {
    method: 'POST',
    path: '/api/servers/:id/start',
    body: null,
    responses: {
      200: messageSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
  stop: {
    method: 'POST',
    path: '/api/servers/:id/stop',
    body: null,
    responses: {
      200: messageSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
  restart: {
    method: 'POST',
    path: '/api/servers/:id/restart',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
});
