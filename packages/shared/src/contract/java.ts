import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const javaContract = c.router({
  getInstalledVersions: {
    method: 'GET',
    path: '/api/java/versions',
    responses: {
      200: z.array(
        z.object({
          name: z.string(),
          path: z.string(),
          version: z.string(),
          isDefault: z.boolean(),
        })
      ),
      401: errorSchema,
    },
  },
});
