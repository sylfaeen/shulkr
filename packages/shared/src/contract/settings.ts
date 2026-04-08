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
  getDiskUsage: {
    method: 'GET',
    path: '/api/settings/disk-usage',
    responses: {
      200: z.object({
        disk: z.object({
          total: z.number(),
          used: z.number(),
          available: z.number(),
        }),
        shulkr: z.object({
          total: z.number(),
          servers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              size: z.number(),
            })
          ),
        }),
      }),
      401: errorSchema,
    },
  },
});
