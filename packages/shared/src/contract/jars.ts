import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const jarInfoSchema = z.object({
  name: z.string(),
  size: z.number(),
  modified: z.string(),
  isActive: z.boolean(),
  source: z.string(),
});

const papermcProjectSchema = z.enum(['paper', 'folia', 'velocity', 'waterfall']);

export const jarsContract = c.router({
  getVersions: {
    method: 'GET',
    path: '/api/jars/versions',
    query: z.object({
      project: papermcProjectSchema,
    }),
    responses: {
      200: z.object({
        versions: z.array(z.string()),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  getBuilds: {
    method: 'GET',
    path: '/api/jars/builds',
    query: z.object({
      project: papermcProjectSchema,
      version: z.string(),
    }),
    responses: {
      200: z.object({
        builds: z.array(z.number()),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  download: {
    method: 'POST',
    path: '/api/servers/:serverId/jars/download',
    body: z.object({
      project: papermcProjectSchema,
      version: z.string(),
      build: z.number().optional(),
    }),
    responses: {
      200: z.object({
        filename: z.string(),
        version: z.string(),
        build: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  progress: {
    method: 'GET',
    path: '/api/servers/:serverId/jars/progress',
    responses: {
      200: z
        .object({
          percentage: z.number(),
          filename: z.string(),
        })
        .nullable(),
      401: errorSchema,
      403: errorSchema,
    },
  },
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/jars',
    responses: {
      200: z.object({
        jars: z.array(jarInfoSchema),
        activeJar: z.string().nullable(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  setActive: {
    method: 'POST',
    path: '/api/servers/:serverId/jars/set-active',
    body: z.object({
      jarFile: z.string(),
    }),
    responses: {
      200: z.object({
        jarFile: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/jars/:jarFile',
    body: null,
    responses: {
      200: z.object({
        deleted: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
});
