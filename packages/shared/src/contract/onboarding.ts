import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { needsSetupResponseSchema, setupRequestSchema, setupResponseSchema } from '../schemas/onboarding';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const onboardingContract = c.router({
  needsSetup: {
    method: 'GET',
    path: '/api/onboarding/needs-setup',
    responses: {
      200: needsSetupResponseSchema,
    },
  },
  setup: {
    method: 'POST',
    path: '/api/onboarding/setup',
    body: setupRequestSchema,
    responses: {
      200: setupResponseSchema,
      429: errorSchema,
    },
  },
});
