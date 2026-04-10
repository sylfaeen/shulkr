import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { firewallProtocolSchema, createFirewallRuleSchema, firewallRuleResponseSchema } from '../schemas/firewall';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const firewallContract = c.router({
  list: {
    method: 'GET',
    path: '/api/firewall',
    responses: {
      200: z.object({
        rules: z.array(firewallRuleResponseSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  add: {
    method: 'POST',
    path: '/api/firewall',
    body: createFirewallRuleSchema,
    responses: {
      201: firewallRuleResponseSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  remove: {
    method: 'DELETE',
    path: '/api/firewall/:ruleId',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  toggle: {
    method: 'POST',
    path: '/api/firewall/:ruleId/toggle',
    body: null,
    responses: {
      200: firewallRuleResponseSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  check: {
    method: 'GET',
    path: '/api/firewall/check',
    query: z.object({
      port: z.coerce.number().min(1024).max(65535),
      protocol: firewallProtocolSchema,
    }),
    responses: {
      200: z.object({
        open: z.boolean(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
