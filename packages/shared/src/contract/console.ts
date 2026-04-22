import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const consoleContract = c.router({
  suggestions: {
    method: 'GET',
    path: '/api/servers/:serverId/console/suggestions',
    query: z.object({ q: z.string().min(1) }),
    responses: {
      200: z.array(z.string()),
      401: errorSchema,
      403: errorSchema,
    },
  },
  history: {
    method: 'GET',
    path: '/api/servers/:serverId/console/command-history',
    query: z.object({ q: z.string().optional() }),
    responses: {
      200: z.array(z.string()),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
