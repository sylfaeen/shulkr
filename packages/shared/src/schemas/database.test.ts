import { describe, it, expect } from 'vitest';
import {
  remoteIpSchema,
  databaseSlugSchema,
  serverDatabaseSchema,
  databaseAccessSchema,
  createDatabaseAccessSchema,
  normalizeIpAddress,
} from './database';

describe('remoteIpSchema', () => {
  it('accepts a literal IPv4 address', () => {
    expect(remoteIpSchema.safeParse('82.64.12.34').success).toBe(true);
  });

  it('accepts a literal IPv6 address', () => {
    expect(remoteIpSchema.safeParse('2001:db8::1').success).toBe(true);
  });

  it('normalizes an IPv4-mapped IPv6 address to its IPv4 form', () => {
    const result = remoteIpSchema.safeParse('::ffff:82.64.12.34');
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('82.64.12.34');
  });

  // An access must pin exactly one machine. Each of these would silently widen it to a range, or to the whole internet.
  it.each(['%', '0.0.0.0', '0.0.0.0/0', '::/0', 'localhost', '192.168.1.%', '10.0.0.0/8', '10.0.*.*'])('rejects %s', (value) => {
    expect(remoteIpSchema.safeParse(value).success).toBe(false);
  });

  it('rejects an IPv4 with an out-of-range octet', () => {
    expect(remoteIpSchema.safeParse('999.1.1.1').success).toBe(false);
  });

  it('normalizeIpAddress leaves a plain IPv4 untouched', () => {
    expect(normalizeIpAddress('82.64.12.34')).toBe('82.64.12.34');
  });
});

describe('databaseSlugSchema', () => {
  it('accepts a lowercase slug with underscores', () => {
    expect(databaseSlugSchema.safeParse('flyteams').success).toBe(true);
    expect(databaseSlugSchema.safeParse('fly_teams2').success).toBe(true);
  });

  it.each(['FlyTeams', 'fly-teams', '2teams', '_teams', 'fly teams', 'fly;drop', ''])('rejects %s', (value) => {
    expect(databaseSlugSchema.safeParse(value).success).toBe(false);
  });

  it('rejects a slug longer than 16 characters', () => {
    expect(databaseSlugSchema.safeParse('a'.repeat(17)).success).toBe(false);
  });
});

// Locks the surface that can carry a plaintext password. A field added to a listing schema by mistake would leak every database password to anyone allowed to list them, which is a strictly weaker permission than revealing them.
describe('listing schemas never expose a password', () => {
  it.each([
    ['serverDatabaseSchema', serverDatabaseSchema],
    ['databaseAccessSchema', databaseAccessSchema],
    ['createDatabaseAccessSchema', createDatabaseAccessSchema],
  ])('%s has no password field', (_name, schema) => {
    expect(Object.keys(schema.shape)).not.toContain('password');
  });
});

describe('createDatabaseAccessSchema', () => {
  it('defaults requireCertificate to false', () => {
    const result = createDatabaseAccessSchema.safeParse({
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.requireCertificate).toBe(false);
  });

  it('rejects a label with characters that do not belong in a display name', () => {
    const result = createDatabaseAccessSchema.safeParse({
      label: "flycraft'; DROP",
      scope: 'read',
      allowedIp: '82.64.12.34',
    });

    expect(result.success).toBe(false);
  });
});
