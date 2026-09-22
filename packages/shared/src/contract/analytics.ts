import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const periodSchema = z.enum(['24h', '7d', '30d']);

export const analyticsContract = c.router({
  activity: {
    method: 'GET',
    path: '/api/servers/:serverId/analytics/activity',
    query: z.object({ period: periodSchema }),
    responses: {
      200: z.array(z.object({ timestamp: z.string(), playerCount: z.number() })),
      401: errorSchema,
      403: errorSchema,
    },
  },
  peakHours: {
    method: 'GET',
    path: '/api/servers/:serverId/analytics/peak-hours',
    query: z.object({ period: periodSchema }),
    responses: {
      200: z.array(z.object({ dayOfWeek: z.number(), hour: z.number(), avgPlayers: z.number() })),
      401: errorSchema,
      403: errorSchema,
    },
  },
  sessionDuration: {
    method: 'GET',
    path: '/api/servers/:serverId/analytics/session-duration',
    query: z.object({ period: periodSchema }),
    responses: {
      200: z.array(z.object({ date: z.string(), avgMinutes: z.number() })),
      401: errorSchema,
      403: errorSchema,
    },
  },
  summary: {
    method: 'GET',
    path: '/api/servers/:serverId/analytics/summary',
    query: z.object({ period: periodSchema }),
    responses: {
      200: z.object({
        uniquePlayers: z.number(),
        totalSessions: z.number(),
        avgDurationMinutes: z.number(),
        peakSimultaneous: z.number(),
        mostActiveHour: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  retention: {
    method: 'GET',
    path: '/api/servers/:serverId/analytics/retention',
    query: z.object({ weeks: z.coerce.number().min(2).max(16).optional() }),
    responses: {
      200: z.array(
        z.object({
          weekStart: z.string(),
          totalPlayers: z.number(),
          retention: z.array(z.number()),
        })
      ),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
