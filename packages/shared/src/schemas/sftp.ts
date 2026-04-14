import { z } from 'zod';

export const sftpPermissionsSchema = z.enum(['read-only', 'read-write']);

export type SftpPermissions = z.infer<typeof sftpPermissionsSchema>;

export const sftpAccountSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  username: z.string(),
  permissions: sftpPermissionsSchema,
  allowedPaths: z.array(z.string()),
  hasPassword: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SftpAccountResponse = z.infer<typeof sftpAccountSchema>;

export const createSftpAccountSchema = z.object({
  serverId: z.string(),
  username: z
    .string()
    .min(1, 'Username is required')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-z_][a-z0-9_-]*$/, 'Username must be lowercase alphanumeric with dashes or underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  permissions: sftpPermissionsSchema.default('read-write'),
  allowedPaths: z.array(z.string()).default([]),
});

export type CreateSftpAccountRequest = z.infer<typeof createSftpAccountSchema>;

export const updateSftpAccountSchema = z.object({
  id: z.number().int(),
  username: z
    .string()
    .min(1, 'Username is required')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-z_][a-z0-9_-]*$/, 'Username must be lowercase alphanumeric with dashes or underscores')
    .optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  permissions: sftpPermissionsSchema.optional(),
  allowedPaths: z.array(z.string()).optional(),
});

export type UpdateSftpAccountRequest = z.infer<typeof updateSftpAccountSchema>;
