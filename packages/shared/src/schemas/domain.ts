import { z } from 'zod';

const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export const domainNameSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(253, 'Domain must be at most 253 characters')
  .regex(DOMAIN_REGEX, 'Invalid domain format (e.g. play.example.com)');

export const domainTypeSchema = z.enum(['http', 'tcp', 'connection', 'panel']);

export type DomainType = z.infer<typeof domainTypeSchema>;

export const addDomainSchema = z.object({
  serverId: z.string(),
  domain: domainNameSchema,
  port: z.number().int().min(1024, 'Port must be at least 1024').max(65535, 'Port must be at most 65535'),
  type: domainTypeSchema.default('http'),
});

export type AddDomainRequest = z.infer<typeof addDomainSchema>;

export const setPanelDomainSchema = z.object({
  domain: domainNameSchema,
});

export type SetPanelDomainRequest = z.infer<typeof setPanelDomainSchema>;
