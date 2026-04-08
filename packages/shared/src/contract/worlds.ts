import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const worldInfoSchema = z.object({
  name: z.string(),
  type: z.enum(['overworld', 'nether', 'end', 'custom']),
  size: z.number(),
  isActive: z.boolean(),
});

export const worldsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/worlds',
    responses: {
      200: z.object({
        worlds: z.array(worldInfoSchema),
        activeLevelName: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  setActive: {
    method: 'PATCH',
    path: '/api/servers/:serverId/worlds/active',
    body: z.object({
      worldName: z.string().min(1),
    }),
    responses: {
      200: z.object({ message: z.string() }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  reset: {
    method: 'DELETE',
    path: '/api/servers/:serverId/worlds/:worldName',
    body: null,
    query: z.object({
      createBackup: z.coerce.boolean().optional(),
    }),
    responses: {
      200: z.object({ message: z.string() }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
});
