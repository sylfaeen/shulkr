import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { createGlobalIpBanSchema, globalIpBanResponseSchema } from '@shulkr/shared/schemas/global_ip_ban';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const globalIpBansContract = c.router({
  list: {
    method: 'GET',
    path: '/api/bans/ips',
    responses: {
      200: z.object({
        bans: z.array(globalIpBanResponseSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  add: {
    method: 'POST',
    path: '/api/bans/ips',
    body: createGlobalIpBanSchema,
    responses: {
      201: globalIpBanResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
    },
  },
  remove: {
    method: 'DELETE',
    path: '/api/bans/ips/:banId',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
});
