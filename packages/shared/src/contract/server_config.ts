import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const serverConfigSchema = z.object({
  format_version: z.number(),
  metadata: z.object({
    name: z.string(),
    description: z.string(),
    author: z.string(),
    exported_at: z.string(),
  }),
  server: z.object({
    min_ram: z.string(),
    max_ram: z.string(),
    jvm_flags: z.string(),
    auto_start: z.boolean(),
    max_backups: z.number(),
  }),
  server_properties: z.record(z.string(), z.string()),
});

export const serverConfigContract = c.router({
  export: {
    method: 'POST',
    path: '/api/servers/:serverId/config/export',
    body: z.object({
      description: z.string().optional(),
    }),
    responses: {
      200: serverConfigSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  import: {
    method: 'POST',
    path: '/api/servers/:serverId/config/import',
    body: serverConfigSchema,
    responses: {
      200: z.object({ message: z.string() }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  validate: {
    method: 'POST',
    path: '/api/servers/config/validate',
    body: z.unknown(),
    responses: {
      200: z.object({ valid: z.boolean(), error: z.string().optional() }),
      401: errorSchema,
    },
  },
});
