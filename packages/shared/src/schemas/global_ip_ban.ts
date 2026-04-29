import { z } from 'zod';

const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
const ipv6Regex =
  /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^(?:[0-9a-fA-F]{1,4}:){1,6}(?::[0-9a-fA-F]{1,4}){1,6}$|^(?:[0-9a-fA-F]{1,4}:){1,7}(?::[0-9a-fA-F]{1,4})?$/;
// Story 59.7: accept IPv4-mapped IPv6 (`::ffff:1.2.3.4`); the backend's normalizeIp() decodes it back to IPv4 before persisting.
const ipv4MappedRegex = /^::ffff:(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/i;

export const ipAddressSchema = z
  .string()
  .min(1)
  .refine((v) => ipv4Regex.test(v) || ipv6Regex.test(v.toLowerCase()) || ipv4MappedRegex.test(v), 'Invalid IP address');

export const createGlobalIpBanSchema = z.object({
  ip: ipAddressSchema,
  reason: z.string().max(500).optional(),
  player_name: z.string().max(64).optional(),
});

export type CreateGlobalIpBanRequest = z.infer<typeof createGlobalIpBanSchema>;

export const globalIpBanResponseSchema = z.object({
  id: z.number(),
  ip: z.string(),
  reason: z.string().nullable(),
  banned_by: z.string(),
  player_name: z.string().nullable(),
  created_at: z.string(),
});

export type GlobalIpBanResponse = z.infer<typeof globalIpBanResponseSchema>;
