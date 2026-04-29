import { z } from 'zod';

// Story 59.9: forbid control chars (notably \n, \r, \0) in passwords. The script subs_sftp.sh pipes `user:password\n` into `chpasswd`; a newline in `password` injects a second line and rewrites the password of an arbitrary account (privilege escalation from server:sftp:create to OS-level root). Defense-in-depth is duplicated in the shell script.
function hasNoControlChars(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

const sftpPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(hasNoControlChars, 'Password contains forbidden control characters');

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
  password: sftpPasswordSchema,
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
  password: sftpPasswordSchema.optional(),
  permissions: sftpPermissionsSchema.optional(),
  allowedPaths: z.array(z.string()).optional(),
});

export type UpdateSftpAccountRequest = z.infer<typeof updateSftpAccountSchema>;
