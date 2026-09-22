import { z } from 'zod';

// A remote consumer is pinned to one literal address. Wildcards, CIDR blocks and hostnames are refused so that an access can never be widened by accident: MariaDB would happily accept 'user'@'%' and the firewall rule would follow.
const FORBIDDEN_HOSTS = ['%', 'localhost', '0.0.0.0', '::', '::/0', '0.0.0.0/0'];

// An IPv4 arriving through an IPv6 socket is written ::ffff:82.64.12.34. It designates the same machine, so both spellings must resolve to the same GRANT.
export function normalizeIpAddress(value: string): string {
  const trimmed = value.trim();
  const mapped = trimmed.match(/^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/i);

  return mapped ? mapped[1] : trimmed;
}

function isSingleLiteralAddress(value: string): boolean {
  if (FORBIDDEN_HOSTS.includes(value.toLowerCase())) return false;
  if (value.includes('%') || value.includes('/') || value.includes('*')) return false;

  if (value.includes(':')) return /^[0-9a-fA-F:]+$/.test(value);

  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;

  return value.split('.').every((octet) => Number(octet) <= 255);
}

export const remoteIpSchema = z
  .string()
  .min(1, 'An IP address is required')
  .transform(normalizeIpAddress)
  .refine(isSingleLiteralAddress, 'Must be a single IP address, wildcards and IP ranges are not allowed');

export const databaseSlugSchema = z
  .string()
  .min(1, 'A name is required')
  .max(16, 'Name must be at most 16 characters')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Name must start with a lowercase letter and contain only lowercase letters, digits and underscores'
  );

export const databaseAccessScopeSchema = z.enum(['read', 'write']);

export type DatabaseAccessScope = z.infer<typeof databaseAccessScopeSchema>;

export const databaseEngineStateSchema = z.enum(['running', 'installed_stopped', 'unavailable']);

export type DatabaseEngineState = z.infer<typeof databaseEngineStateSchema>;

export const databaseEngineStatusSchema = z.object({
  state: databaseEngineStateSchema,
  host: z.string(),
  port: z.number(),
  remoteEnabled: z.boolean(),
});

export type DatabaseEngineStatus = z.infer<typeof databaseEngineStatusSchema>;

export const serverDatabaseSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  slug: z.string(),
  dbName: z.string(),
  dbUser: z.string(),
  host: z.string(),
  port: z.number(),
  sizeBytes: z.number().nullable(),
  accessCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ServerDatabaseResponse = z.infer<typeof serverDatabaseSchema>;

// The only shape that carries a plaintext password. Returned by creation, rotation and the explicit reveal endpoint, never by a listing.
export const databaseCredentialsSchema = z.object({
  host: z.string(),
  port: z.number(),
  dbName: z.string(),
  username: z.string(),
  password: z.string(),
});

export type DatabaseCredentials = z.infer<typeof databaseCredentialsSchema>;

export const createDatabaseSchema = z.object({
  serverId: z.string().min(1),
  slug: databaseSlugSchema,
});

export type CreateDatabaseRequest = z.infer<typeof createDatabaseSchema>;

export const deleteDatabaseSchema = z.object({
  confirmation: z.string().min(1, 'Type the database name to confirm'),
});

export const databaseAccessSchema = z.object({
  id: z.number(),
  databaseId: z.number(),
  label: z.string(),
  username: z.string(),
  scope: databaseAccessScopeSchema,
  allowedIp: z.string(),
  requireCertificate: z.boolean(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type DatabaseAccessResponse = z.infer<typeof databaseAccessSchema>;

export const createDatabaseAccessSchema = z.object({
  label: z
    .string()
    .min(1, 'A label is required')
    .max(32, 'Label must be at most 32 characters')
    .regex(/^[\w -]+$/, 'Label must contain only letters, digits, spaces, dashes and underscores'),
  scope: databaseAccessScopeSchema,
  allowedIp: remoteIpSchema,
  requireCertificate: z.boolean().default(false),
});

export type CreateDatabaseAccessRequest = z.infer<typeof createDatabaseAccessSchema>;

export const databaseAccessCredentialsSchema = databaseCredentialsSchema.extend({
  scope: databaseAccessScopeSchema,
  allowedIp: z.string(),
  caCertificateUrl: z.string(),
  // Only present on creation of an access that requires a client certificate. Never stored, never shown again.
  clientCertificate: z.string().optional(),
  clientKey: z.string().optional(),
});

export type DatabaseAccessCredentials = z.infer<typeof databaseAccessCredentialsSchema>;
