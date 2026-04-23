import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({ code: z.string(), message: z.string() });

export const serverTypeSchema = z.enum(['survival', 'creative', 'minigames']);
export type ServerType = z.infer<typeof serverTypeSchema>;

export const communitySizeSchema = z.enum(['1-5', '5-20', '20-50', '50+']);
export type CommunitySize = z.infer<typeof communitySizeSchema>;

export const backupFrequencySchema = z.enum(['daily', 'weekly', 'off']);
export type BackupFrequency = z.infer<typeof backupFrequencySchema>;

export const wizardPluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['permissions', 'protection', 'utilities', 'admin', 'worldedit', 'economy', 'holograms']),
  required: z.boolean().default(false),
  modrinthSlug: z.string().optional(),
});

export type WizardPlugin = z.infer<typeof wizardPluginSchema>;

export const wizardSizePresetSchema = z.object({
  size: communitySizeSchema,
  minRamMb: z.number(),
  maxRamMb: z.number(),
  label: z.string(),
});

export const wizardPresetsResponseSchema = z.object({
  hostRamMb: z.number(),
  recommendedMaxRamMb: z.number(),
  sizes: z.array(wizardSizePresetSchema),
  mcSettingsByType: z.record(z.string(), z.record(z.string(), z.string())),
});

export const createFirstServerBodySchema = z.object({
  name: z.string().min(1).max(64).default('Mon serveur'),
  type: serverTypeSchema,
  size: communitySizeSchema,
  backup: z.object({
    frequency: backupFrequencySchema,
    maxBackups: z.number().int().min(1).max(100).default(7),
    destination: z.enum(['local', 'cloud']).default('local'),
    cloudDestinationId: z.string().optional(),
  }),
  webhook: z
    .object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    })
    .nullable()
    .default(null),
});

export type CreateFirstServerInput = z.infer<typeof createFirstServerBodySchema>;

export const createFirstServerResponseSchema = z.object({
  serverId: z.string(),
  name: z.string(),
});

export const wizardContract = c.router({
  getPresets: {
    method: 'GET',
    path: '/api/wizard/first-server/presets',
    responses: {
      200: wizardPresetsResponseSchema,
      401: errorSchema,
    },
  },
  createFirstServer: {
    method: 'POST',
    path: '/api/wizard/first-server',
    body: createFirstServerBodySchema,
    responses: {
      201: createFirstServerResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
    },
  },
});
