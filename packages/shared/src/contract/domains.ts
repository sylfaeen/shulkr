import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { addDomainSchema, domainTypeSchema, setPanelDomainSchema } from '../schemas/domain';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

const domainSchema = z.object({
  id: z.number(),
  serverId: z.string().nullable(),
  domain: z.string(),
  port: z.number().nullable(),
  type: domainTypeSchema,
  sslEnabled: z.boolean(),
  sslExpiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const domainsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/domains',
    query: z.object({
      serverId: z.string(),
    }),
    responses: {
      200: z.object({
        domains: z.array(domainSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  add: {
    method: 'POST',
    path: '/api/domains',
    body: addDomainSchema,
    responses: {
      201: domainSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  remove: {
    method: 'DELETE',
    path: '/api/domains/:id',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  enableSsl: {
    method: 'POST',
    path: '/api/domains/:id/enable-ssl',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  dnsCheck: {
    method: 'GET',
    path: '/api/domains/dns-check',
    query: z.object({
      domain: z.string(),
    }),
    responses: {
      200: z.object({
        match: z.boolean(),
        expected: z.string().nullable(),
        actual: z.string().nullable(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  panelDomain: {
    method: 'GET',
    path: '/api/domains/panel',
    responses: {
      200: z.object({
        domain: domainSchema.nullable(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  setPanelDomain: {
    method: 'POST',
    path: '/api/domains/panel',
    body: setPanelDomainSchema,
    responses: {
      200: domainSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  removePanelDomain: {
    method: 'DELETE',
    path: '/api/domains/panel',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  renew: {
    method: 'POST',
    path: '/api/domains/renew',
    body: null,
    responses: {
      200: z.object({
        renewed: z.number(),
        failed: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  refreshExpiry: {
    method: 'GET',
    path: '/api/domains/:id/refresh-expiry',
    responses: {
      200: domainSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  ensureTimer: {
    method: 'GET',
    path: '/api/domains/ensure-timer',
    responses: {
      200: z.object({
        active: z.boolean(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
