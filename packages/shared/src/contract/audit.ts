import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const auditEntrySchema = z.object({
  id: z.number(),
  userId: z.number(),
  username: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  details: z.record(z.string(), z.string()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
});

export const auditContract = c.router({
  list: {
    method: 'GET',
    path: '/api/audit',
    query: z.object({
      userId: z.coerce.number().optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      limit: z.coerce.number().min(1).max(500).optional(),
      offset: z.coerce.number().optional(),
    }),
    responses: {
      200: z.object({
        entries: z.array(auditEntrySchema),
        total: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
