import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const envContract = c.router({
  getContent: {
    method: 'GET',
    path: '/api/env',
    responses: {
      200: z.object({
        content: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  saveContent: {
    method: 'POST',
    path: '/api/env',
    body: z.object({
      content: z.string(),
    }),
    responses: {
      200: z.object({
        success: z.literal(true),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
