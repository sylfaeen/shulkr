import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const logFileSchema = z.object({
  filename: z.string(),
  size: z.number(),
  modified: z.string(),
  isLatest: z.boolean(),
});

const logLineSchema = z.object({
  time: z.string().optional(),
  thread: z.string().optional(),
  level: z.string().optional(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const logsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/logs',
    responses: {
      200: z.array(logFileSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  read: {
    method: 'GET',
    path: '/api/servers/:serverId/logs/read',
    query: z.object({
      filename: z.string(),
    }),
    responses: {
      200: z.object({
        filename: z.string(),
        lines: z.array(logLineSchema),
        totalLines: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/logs/:filename',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
});
