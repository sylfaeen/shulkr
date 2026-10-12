import { z } from 'zod';

export const serverResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  jar_file: z.string().nullable(),
  min_ram: z.string(),
  max_ram: z.string(),
  jvm_flags: z.string(),
  java_port: z.number(),
  java_path: z.string().nullable(),
  auto_start: z.boolean(),
  auto_restart_on_crash: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  max_backups: z.number(),
  status: z.enum(['stopped', 'starting', 'running', 'stopping', 'deleting']),
  pid: z.number().nullable(),
  uptime: z.number().nullable(),
  cpu: z.number().nullable(),
  player_count: z.number(),
});

export type ServerResponse = z.infer<typeof serverResponseSchema>;

export const createServerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name must be at most 64 characters'),
  min_ram: z
    .string()
    .regex(/^\d+[GMK]$/, 'Invalid RAM format (e.g., 1G, 512M)')
    .optional(),
  max_ram: z
    .string()
    .regex(/^\d+[GMK]$/, 'Invalid RAM format (e.g., 2G, 1024M)')
    .optional(),
  jvm_flags: z.string().optional(),
  java_port: z.number().int().min(1024).max(65535).optional(),
  java_path: z.string().nullable().optional(),
  auto_start: z.boolean().optional(),
});

export type CreateServerRequest = z.infer<typeof createServerSchema>;

export const updateServerSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  jar_file: z.string().min(1).optional(),
  min_ram: z
    .string()
    .regex(/^\d+[GMK]$/)
    .optional(),
  max_ram: z
    .string()
    .regex(/^\d+[GMK]$/)
    .optional(),
  jvm_flags: z.string().optional(),
  java_port: z.number().int().min(1024).max(65535).optional(),
  java_path: z.string().nullable().optional(),
  auto_start: z.boolean().optional(),
  auto_restart_on_crash: z.boolean().optional(),
  max_backups: z.number().int().min(0).max(100).optional(),
});

export type UpdateServerRequest = z.infer<typeof updateServerSchema>;
