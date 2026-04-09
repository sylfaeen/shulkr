import { z } from 'zod';

export const needsSetupResponseSchema = z.object({
  needsSetup: z.boolean(),
});

export type NeedsSetupResponse = z.infer<typeof needsSetupResponseSchema>;

export const setupRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username must contain only letters, numbers, _ or -'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
