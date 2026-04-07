import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const settingsContract = c.router({
  getVersionInfo: {
    method: 'GET',
    path: '/api/settings/version',
    responses: {
      200: z.object({
        currentVersion: z.string(),
        latestVersion: z.string().nullable(),
        ipAddress: z.string().nullable(),
      }),
      401: errorSchema,
    },
  },
  getSystemdUnit: {
    method: 'GET',
    path: '/api/settings/systemd',
    responses: {
      200: z.object({
        content: z.string(),
      }),
      401: errorSchema,
    },
  },
});
