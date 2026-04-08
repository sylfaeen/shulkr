import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { loginRequestSchema, loginResponseSchema } from '../schemas/auth';
import { verifyTotpLoginRequestSchema, loginTotpRequiredResponseSchema } from '../schemas/totp';
import { userResponseSchema } from '../schemas/user';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const authContract = c.router({
  login: {
    method: 'POST',
    path: '/api/auth/login',
    body: loginRequestSchema,
    responses: {
      200: z.union([loginResponseSchema, loginTotpRequiredResponseSchema]),
      401: errorSchema,
      429: errorSchema,
    },
  },
  verifyTotp: {
    method: 'POST',
    path: '/api/auth/verify-totp',
    body: verifyTotpLoginRequestSchema,
    responses: {
      200: loginResponseSchema.extend({
        recovery_codes_remaining: z.number().optional(),
      }),
      401: errorSchema,
      429: errorSchema,
    },
  },
  logout: {
    method: 'POST',
    path: '/api/auth/logout',
    body: null,
    responses: {
      200: messageSchema,
    },
  },
  refresh: {
    method: 'POST',
    path: '/api/auth/refresh',
    body: null,
    responses: {
      200: loginResponseSchema,
      401: errorSchema,
      429: errorSchema,
    },
  },
  me: {
    method: 'GET',
    path: '/api/auth/me',
    responses: {
      200: userResponseSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
});
