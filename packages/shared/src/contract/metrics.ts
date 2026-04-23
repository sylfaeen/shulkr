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
  tps: z.number().nullable(),
  mspt: z.number().nullable(),
});

const gcPointSchema = z.object({
  timestamp: z.string(),
  durationMs: z.number(),
  gcType: z.string(),
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
  gc: {
    method: 'GET',
    path: '/api/servers/:serverId/metrics/gc',
    query: z.object({
      hours: z.coerce.number().min(1).max(168).optional(),
    }),
    responses: {
      200: z.object({
        totalPauses: z.number(),
        totalDurationMs: z.number(),
        maxDurationMs: z.number(),
        points: z.array(gcPointSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
