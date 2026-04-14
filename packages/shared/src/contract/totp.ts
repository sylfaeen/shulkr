import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { totpSetupResponseSchema, totpVerifyRequestSchema, totpDisableRequestSchema } from '../schemas/totp';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const totpContract = c.router({
  status: {
    method: 'GET',
    path: '/api/totp/status',
    responses: {
      200: z.object({
        enabled: z.boolean(),
      }),
      401: errorSchema,
    },
  },
  setup: {
    method: 'POST',
    path: '/api/totp/setup',
    body: null,
    responses: {
      200: totpSetupResponseSchema,
      401: errorSchema,
    },
  },
  verify: {
    method: 'POST',
    path: '/api/totp/verify',
    body: totpVerifyRequestSchema,
    responses: {
      200: z.object({
        success: z.literal(true),
      }),
      401: errorSchema,
    },
  },
  disable: {
    method: 'POST',
    path: '/api/totp/disable',
    body: totpDisableRequestSchema,
    responses: {
      200: z.object({
        success: z.literal(true),
      }),
      401: errorSchema,
    },
  },
});
