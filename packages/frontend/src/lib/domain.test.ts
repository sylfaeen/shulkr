import { describe, it, expect } from 'vitest';
import { getHstsPreloadedTld, isCloudflareIp } from '@shulkr/frontend/lib/domain';

describe('isCloudflareIp', () => {
  it('matches addresses inside the published Cloudflare ranges', () => {
    expect(isCloudflareIp('104.21.5.6')).toBe(true);
    expect(isCloudflareIp('172.67.180.1')).toBe(true);
    expect(isCloudflareIp('188.114.97.3')).toBe(true);
  });

  it('rejects other addresses and malformed input', () => {
    expect(isCloudflareIp('203.0.113.10')).toBe(false);
    expect(isCloudflareIp('104.15.255.255')).toBe(false);
    expect(isCloudflareIp('')).toBe(false);
    expect(isCloudflareIp('2606:4700::1')).toBe(false);
  });
});

describe('getHstsPreloadedTld', () => {
  it('returns the TLD of HSTS-preloaded domains', () => {
    expect(getHstsPreloadedTld('panel.shulkr.dev')).toBe('.dev');
    expect(getHstsPreloadedTld('Play.Example.APP')).toBe('.app');
  });

  it('returns null for TLDs that still allow plain HTTP', () => {
    expect(getHstsPreloadedTld('panel.example.com')).toBeNull();
    expect(getHstsPreloadedTld('panel.example.fr')).toBeNull();
  });
});
