import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const searchHitSchema = z.object({
  project_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  categories: z.array(z.string()),
  versions: z.array(z.string()),
  downloads: z.number(),
  follows: z.number(),
  icon_url: z.string().nullable(),
  date_modified: z.string(),
  license: z.string(),
});

const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  body: z.string(),
  categories: z.array(z.string()),
  license: z.object({ id: z.string(), name: z.string(), url: z.string().nullable() }),
  downloads: z.number(),
  followers: z.number(),
  icon_url: z.string().nullable(),
  gallery: z.array(z.object({ url: z.string(), title: z.string().nullable(), description: z.string().nullable() })),
  source_url: z.string().nullable(),
  wiki_url: z.string().nullable(),
  discord_url: z.string().nullable(),
  date_created: z.string(),
  date_modified: z.string(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
});

const versionFileSchema = z.object({
  hashes: z.object({ sha512: z.string(), sha1: z.string() }),
  url: z.string(),
  filename: z.string(),
  primary: z.boolean(),
  size: z.number(),
});

const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  changelog: z.string().nullable(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  files: z.array(versionFileSchema),
  date_published: z.string(),
  downloads: z.number(),
  version_type: z.enum(['release', 'beta', 'alpha']),
});

const categorySchema = z.object({
  name: z.string(),
  project_type: z.string(),
  header: z.string(),
});

export const marketplaceContract = c.router({
  search: {
    method: 'GET',
    path: '/api/marketplace/search',
    query: z.object({
      source: z.enum(['modrinth', 'hangar']).optional(),
      q: z.string().optional(),
      category: z.string().optional(),
      gameVersion: z.string().optional(),
      loader: z.string().optional(),
      index: z.enum(['relevance', 'downloads', 'follows', 'newest', 'updated']).optional(),
      limit: z.coerce.number().min(1).max(100).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({
        hits: z.array(searchHitSchema),
        totalHits: z.number(),
      }),
      401: errorSchema,
    },
  },
  project: {
    method: 'GET',
    path: '/api/marketplace/project/:idOrSlug',
    query: z.object({
      source: z.enum(['modrinth', 'hangar']).optional(),
    }),
    responses: {
      200: projectSchema,
      401: errorSchema,
      404: errorSchema,
    },
  },
  versions: {
    method: 'GET',
    path: '/api/marketplace/project/:idOrSlug/versions',
    query: z.object({
      source: z.enum(['modrinth', 'hangar']).optional(),
      gameVersion: z.string().optional(),
      loader: z.string().optional(),
    }),
    responses: {
      200: z.array(versionSchema),
      401: errorSchema,
      404: errorSchema,
    },
  },
  categories: {
    method: 'GET',
    path: '/api/marketplace/categories',
    responses: {
      200: z.array(categorySchema),
      401: errorSchema,
    },
  },
  updates: {
    method: 'GET',
    path: '/api/servers/:serverId/marketplace/updates',
    responses: {
      200: z.array(
        z.object({
          filename: z.string(),
          source: z.enum(['modrinth', 'hangar']),
          projectId: z.string(),
          currentVersionId: z.string(),
          latestVersion: z.object({
            id: z.string(),
            version_number: z.string(),
            files: z.array(versionFileSchema),
            date_published: z.string(),
            version_type: z.enum(['release', 'beta', 'alpha']),
          }),
        })
      ),
      401: errorSchema,
      403: errorSchema,
    },
  },
  install: {
    method: 'POST',
    path: '/api/servers/:serverId/marketplace/install',
    body: z.object({
      source: z.enum(['modrinth', 'hangar']),
      projectId: z.string(),
      versionId: z.string(),
      filename: z.string(),
      fileUrl: z.string(),
      fileHash: z.string().optional(),
    }),
    responses: {
      200: z.object({
        filename: z.string(),
        message: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
});
