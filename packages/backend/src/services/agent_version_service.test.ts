import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExpectedPluginVersion,
  hasVersionMismatch,
  getEmbeddedJarPath,
  getSupportedPlatforms,
} from '@shulkr/backend/services/agent_version_service';
import { setAppDeps, clearAppDeps } from '@shulkr/backend/deps';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';

describe('agent_version_service', () => {
  beforeEach(() => {
    clearAppDeps();
    setAppDeps(createTestDeps());
  });

  it('exposes module-level functions only (no class/singleton)', () => {
    expect(typeof getExpectedPluginVersion).toBe('function');
    expect(typeof hasVersionMismatch).toBe('function');
    expect(typeof getEmbeddedJarPath).toBe('function');
    expect(typeof getSupportedPlatforms).toBe('function');
  });

  it('getSupportedPlatforms returns at least paper', () => {
    const platforms = getSupportedPlatforms();
    expect(platforms.length).toBeGreaterThan(0);
    expect(platforms).toContain('paper');
  });

  it('hasVersionMismatch returns false when versions match the expected', async () => {
    const expected = await getExpectedPluginVersion('paper');
    expect(await hasVersionMismatch(expected, 'paper')).toBe(false);
  });

  it('hasVersionMismatch returns true when plugin version differs', async () => {
    expect(await hasVersionMismatch('0.0.1-from-the-stone-age', 'paper')).toBe(true);
  });
});
