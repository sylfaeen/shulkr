import { z } from 'zod';
import { ALL_PERMISSIONS } from '../lib/permissions';

export const AVAILABLE_PERMISSIONS = ALL_PERMISSIONS;

export const userResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  permissions: z.array(z.string()),
  locale: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  password: passwordSchema,
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
  password: passwordSchema.optional(),
  permissions: z.array(z.string()).optional(),
  locale: z.string().nullable().optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
