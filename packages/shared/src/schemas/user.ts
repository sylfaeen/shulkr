import { z } from 'zod';

export const AVAILABLE_PERMISSIONS = [
  '*',
  'server:power',
  'server:console',
  'server:general',
  'server:backups',
  'server:tasks',
  'server:plugins',
  'server:jars',
  'server:jvm',
  'settings:firewall',
  'server:sftp',
  'server:domains',
  'files:read',
  'files:write',
  'users:manage',
  'settings:general',
  'settings:environment',
  'settings:sftp',
] as const;

export const userResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  permissions: z.array(z.string()),
  locale: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
  permissions: z.array(z.string()).default([]),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens')
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .optional(),
  permissions: z.array(z.string()).optional(),
  locale: z.string().nullable().optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
