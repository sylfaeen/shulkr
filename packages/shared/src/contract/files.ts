import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

const fileInfoSchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number(),
  modified: z.string(),
});

export const filesContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/files',
    query: z.object({
      path: z.string().optional(),
    }),
    responses: {
      200: z.array(fileInfoSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  read: {
    method: 'GET',
    path: '/api/servers/:serverId/files/read',
    query: z.object({
      path: z.string(),
    }),
    responses: {
      200: z.object({
        path: z.string(),
        content: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  write: {
    method: 'POST',
    path: '/api/servers/:serverId/files/write',
    body: z.object({
      path: z.string(),
      content: z.string(),
    }),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/files',
    body: null,
    query: z.object({
      path: z.string(),
    }),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  mkdir: {
    method: 'POST',
    path: '/api/servers/:serverId/files/mkdir',
    body: z.object({
      path: z.string(),
    }),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  rename: {
    method: 'POST',
    path: '/api/servers/:serverId/files/rename',
    body: z.object({
      oldPath: z.string(),
      newPath: z.string(),
    }),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  info: {
    method: 'GET',
    path: '/api/servers/:serverId/files/info',
    query: z.object({
      path: z.string(),
    }),
    responses: {
      200: z.object({
        type: z.string(),
        name: z.string(),
        size: z.number(),
        modified: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
