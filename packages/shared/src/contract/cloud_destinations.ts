import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({ code: z.string(), message: z.string() });
const messageSchema = z.object({ message: z.string() });

export const cloudProviderSchema = z.enum(['aws-s3', 'cloudflare-r2', 'ovh', 'scaleway', 'minio-custom']);
export type CloudProvider = z.infer<typeof cloudProviderSchema>;

export const cloudDestinationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: cloudProviderSchema,
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  prefix: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCloudDestinationSchema = z.object({
  name: z.string().min(1).max(64),
  provider: cloudProviderSchema,
  endpoint: z.string().url(),
  region: z.string().min(1).max(64),
  bucket: z.string().min(1).max(256),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(512),
  prefix: z.string().max(256).default(''),
});

export const updateCloudDestinationSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  endpoint: z.string().url().optional(),
  region: z.string().min(1).max(64).optional(),
  bucket: z.string().min(1).max(256).optional(),
  accessKeyId: z.string().min(1).max(256).optional(),
  secretAccessKey: z.string().min(1).max(512).optional(),
  prefix: z.string().max(256).optional(),
  enabled: z.boolean().optional(),
});

export const testConnectionSchema = z.object({
  auth: z.boolean(),
  list: z.boolean(),
  write: z.boolean(),
  error: z.string().optional(),
  errorCode: z.enum(['auth', 'bucket', 'permissions', 'timeout', 'unknown']).optional(),
});

export type CloudDestinationResponse = z.infer<typeof cloudDestinationResponseSchema>;
export type CreateCloudDestinationInput = z.infer<typeof createCloudDestinationSchema>;
export type UpdateCloudDestinationInput = z.infer<typeof updateCloudDestinationSchema>;
export type TestConnectionResult = z.infer<typeof testConnectionSchema>;

export const cloudDestinationsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/cloud-destinations',
    responses: {
      200: z.object({ destinations: z.array(cloudDestinationResponseSchema) }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  get: {
    method: 'GET',
    path: '/api/cloud-destinations/:id',
    responses: {
      200: cloudDestinationResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/cloud-destinations',
    body: createCloudDestinationSchema,
    responses: {
      201: cloudDestinationResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/cloud-destinations/:id',
    body: updateCloudDestinationSchema,
    responses: {
      200: cloudDestinationResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/cloud-destinations/:id',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      409: errorSchema,
    },
  },
  test: {
    method: 'POST',
    path: '/api/cloud-destinations/test',
    body: createCloudDestinationSchema,
    responses: {
      200: testConnectionSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
});
