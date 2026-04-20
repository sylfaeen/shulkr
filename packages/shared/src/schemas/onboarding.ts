import { z } from 'zod';

export const needsSetupResponseSchema = z.object({
  needsSetup: z.boolean(),
});

export type NeedsSetupResponse = z.infer<typeof needsSetupResponseSchema>;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const setupRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username must contain only letters, numbers, _ or -'),
  password: passwordSchema,
  locale: z.string().optional(),
});

export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const setupResponseSchema = z.object({
  access_token: z.string(),
  user: z.object({
    id: z.number(),
    username: z.string(),
    permissions: z.array(z.string()),
    locale: z.string().nullable(),
  }),
});

export type SetupResponse = z.infer<typeof setupResponseSchema>;
