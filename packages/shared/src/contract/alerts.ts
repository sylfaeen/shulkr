import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const alertRuleSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  name: z.string(),
  metric: z.enum(['cpu', 'ram', 'disk', 'tps']),
  operator: z.enum(['>', '<', '>=', '<=']),
  threshold: z.number(),
  actions: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.enum(['cpu', 'ram', 'disk', 'tps']),
  operator: z.enum(['>', '<', '>=', '<=']),
  threshold: z.number().min(0).max(100),
  actions: z.array(z.string()).min(1),
});

const updateAlertSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  metric: z.enum(['cpu', 'ram', 'disk', 'tps']).optional(),
  operator: z.enum(['>', '<', '>=', '<=']).optional(),
  threshold: z.number().min(0).max(100).optional(),
  actions: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
});

const alertEventSchema = z.object({
  id: z.number(),
  alertRuleId: z.number(),
  serverId: z.string(),
  metric: z.string(),
  value: z.number(),
  threshold: z.number(),
  actionsTaken: z.array(z.string()),
  createdAt: z.string(),
});

export const alertsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/alerts',
    responses: {
      200: z.array(alertRuleSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/servers/:serverId/alerts',
    body: createAlertSchema,
    responses: {
      200: alertRuleSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/servers/:serverId/alerts/:alertId',
    body: updateAlertSchema,
    responses: {
      200: alertRuleSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/alerts/:alertId',
    body: null,
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  events: {
    method: 'GET',
    path: '/api/servers/:serverId/alerts/events',
    query: z.object({
      limit: z.coerce.number().min(1).max(200).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({ events: z.array(alertEventSchema), total: z.number() }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
