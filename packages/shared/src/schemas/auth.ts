import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    user: z.object({
      id: z.number(),
      username: z.string(),
      permissions: z.array(z.string()),
      locale: z.string().nullable(),
    }),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
