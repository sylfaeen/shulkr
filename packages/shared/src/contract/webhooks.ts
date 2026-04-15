import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const webhookLanguageSchema = z.enum(['en', 'fr', 'es', 'de']);
export type WebhookLanguage = z.infer<typeof webhookLanguageSchema>;

export const webhookEventSchema = z.enum([
  'server:start',
  'server:stop',
  'server:crash',
  'backup:success',
  'backup:failure',
  'player:join',
  'player:leave',
  'player:ban',
  'task:success',
  'task:failure',
]);

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const messageTemplatesSchema = z.record(webhookEventSchema, z.string().max(2000)).nullable();

const webhookSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  name: z.string(),
  url: z.string(),
  format: z.enum(['discord', 'generic']),
  language: webhookLanguageSchema,
  events: z.array(webhookEventSchema),
  messageTemplates: messageTemplatesSchema,
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  format: z.enum(['discord', 'generic']),
  language: webhookLanguageSchema.optional(),
  events: z.array(webhookEventSchema).min(1),
  messageTemplates: messageTemplatesSchema.optional(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  format: z.enum(['discord', 'generic']).optional(),
  language: webhookLanguageSchema.optional(),
  events: z.array(webhookEventSchema).min(1).optional(),
  messageTemplates: messageTemplatesSchema.optional(),
  enabled: z.boolean().optional(),
});

const deliverySchema = z.object({
  id: z.number(),
  webhookId: z.number(),
  event: z.string(),
  status: z.enum(['success', 'failure']),
  statusCode: z.number().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
});

const deliveryDetailSchema = deliverySchema.extend({
  requestPayload: z.string().nullable(),
  responseBody: z.string().nullable(),
});

const templatesSchema = z.record(webhookEventSchema, z.string());

export const webhooksContract = c.router({
  get: {
    method: 'GET',
    path: '/api/servers/:serverId/webhooks/:webhookId',
    responses: {
      200: webhookSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/webhooks',
    responses: {
      200: z.array(webhookSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/servers/:serverId/webhooks',
    body: createWebhookSchema,
    responses: {
      200: webhookSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/servers/:serverId/webhooks/:webhookId',
    body: updateWebhookSchema,
    responses: {
      200: webhookSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/webhooks/:webhookId',
    body: null,
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  test: {
    method: 'POST',
    path: '/api/servers/:serverId/webhooks/:webhookId/test',
    body: null,
    responses: {
      200: z.object({ success: z.boolean(), statusCode: z.number() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
  templates: {
    method: 'GET',
    path: '/api/webhooks/templates',
    query: z.object({
      language: webhookLanguageSchema,
    }),
    responses: {
      200: templatesSchema,
      400: errorSchema,
      401: errorSchema,
    },
  },
  deliveries: {
    method: 'GET',
    path: '/api/servers/:serverId/webhooks/:webhookId/deliveries',
    query: z.object({
      limit: z.coerce.number().min(1).max(100).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({ deliveries: z.array(deliverySchema), total: z.number() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  deliveryDetail: {
    method: 'GET',
    path: '/api/servers/:serverId/webhooks/:webhookId/deliveries/:deliveryId',
    responses: {
      200: deliveryDetailSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
});
