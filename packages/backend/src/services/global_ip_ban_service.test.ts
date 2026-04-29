import { describe, it, expect } from 'vitest';
import {
  listGlobalIpBans,
  addGlobalIpBan,
  removeGlobalIpBan,
  isGloballyBanned,
  syncGlobalIpBans,
  normalizeIp,
} from '@shulkr/backend/services/global_ip_ban_service';

describe('global_ip_ban_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof listGlobalIpBans).toBe('function');
    expect(typeof addGlobalIpBan).toBe('function');
    expect(typeof removeGlobalIpBan).toBe('function');
    expect(typeof isGloballyBanned).toBe('function');
    expect(typeof syncGlobalIpBans).toBe('function');
  });
});

// Story 59.7 AC1-AC4: pure unit tests of normalizeIp().
describe('normalizeIp (story 59.7)', () => {
  it('AC1: decodes IPv4-mapped IPv6 to its IPv4 form', () => {
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('AC1 bis: decoding is case-insensitive on the prefix', () => {
    expect(normalizeIp('::FFFF:1.2.3.4')).toBe('1.2.3.4');
  });

  it('AC2: standard IPv4 is preserved unchanged', () => {
    expect(normalizeIp('1.2.3.4')).toBe('1.2.3.4');
  });

  it('AC3: real IPv6 is preserved (lowercased only, no false translation)', () => {
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('AC4: ::ffff: prefix with non-IPv4 suffix is preserved (lowercased only)', () => {
    expect(normalizeIp('::ffff:wat')).toBe('::ffff:wat');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeIp('  1.2.3.4  ')).toBe('1.2.3.4');
  });
});
