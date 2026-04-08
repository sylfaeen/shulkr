import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const pluginInfoSchema = z.object({
  name: z.string(),
  filename: z.string(),
  enabled: z.boolean(),
  size: z.number(),
  modified: z.string(),
  version: z.string().nullable(),
  description: z.string().nullable(),
  authors: z.array(z.string()),
});

export const pluginsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/plugins',
    responses: {
      200: z.object({
        plugins: z.array(pluginInfoSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  toggle: {
    method: 'POST',
    path: '/api/servers/:serverId/plugins/toggle',
    body: z.object({
      filename: z.string(),
    }),
    responses: {
      200: z.object({
        name: z.string(),
        enabled: z.boolean(),
        message: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/plugins/:filename',
    body: null,
    responses: {
      200: z.object({
        name: z.string(),
        message: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
});
