import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const sparkContract = c.router({
  status: {
    method: 'GET',
    path: '/api/servers/:serverId/spark/status',
    responses: {
      200: z.object({ installed: z.boolean() }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  startProfiler: {
    method: 'POST',
    path: '/api/servers/:serverId/spark/profiler/start',
    body: null,
    responses: {
      200: z.object({ success: z.boolean(), error: z.string().optional() }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  stopProfiler: {
    method: 'POST',
    path: '/api/servers/:serverId/spark/profiler/stop',
    body: null,
    responses: {
      200: z.object({ success: z.boolean(), url: z.string().optional(), error: z.string().optional() }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  health: {
    method: 'GET',
    path: '/api/servers/:serverId/spark/health',
    responses: {
      200: z.object({ tps: z.number().optional(), mspt: z.number().optional(), raw: z.string() }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
