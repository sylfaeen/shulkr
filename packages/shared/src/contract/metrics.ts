import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const metricsPointSchema = z.object({
  timestamp: z.string(),
  cpu: z.number(),
  memoryPercent: z.number(),
  playerCount: z.number(),
});

export const metricsContract = c.router({
  history: {
    method: 'GET',
    path: '/api/servers/:serverId/metrics/history',
    query: z.object({
      period: z.enum(['1h', '6h', '24h', '7d', '30d']).optional(),
    }),
    responses: {
      200: z.object({
        points: z.array(metricsPointSchema),
        period: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
