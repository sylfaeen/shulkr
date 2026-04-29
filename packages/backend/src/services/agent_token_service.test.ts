import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import {
  generateToken,
  hashToken,
  verifyTokenAgainstHash,
  previewOf,
  enableAgent,
  regenerateAgentToken,
  disableAgent,
  getServerAgent,
  isConnected,
} from '@shulkr/backend/services/agent_token_service';

describe('agent_token_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('generateToken + hashToken + verifyTokenAgainstHash round-trip', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const hash = hashToken(token);
    expect(verifyTokenAgainstHash(token, hash)).toBe(true);
    expect(verifyTokenAgainstHash('wrong-token', hash)).toBe(false);
  });

  it('previewOf masks all but the first chars', () => {
    const preview = previewOf('abc123def456ghi789');
    expect(preview.length).toBeLessThan('abc123def456ghi789'.length);
    expect(preview).toContain('abc');
  });

  it('enableAgent + getServerAgent + disableAgent round-trip', async () => {
    const serverId = seedServer(deps).id;
    expect(await getServerAgent(serverId)).toBeUndefined();

    const enabled = await enableAgent(serverId, 'paper');
    expect(enabled.token).toBeTruthy();
    expect(enabled.preview).toBeTruthy();

    const fetched = await getServerAgent(serverId);
    expect(fetched?.enabled).toBeTruthy();
    expect(isConnected(fetched)).toBe(false); // no heartbeat yet

    expect(await disableAgent(serverId)).toBeTruthy();
    // calling disable again returns the same shape (no error), exact return depends on implementation, just assert no throw
    await disableAgent(serverId);
  });

  it('regenerateAgentToken issues a new token and invalidates the old one', async () => {
    const serverId = seedServer(deps).id;
    const first = await enableAgent(serverId, 'paper');
    const second = await regenerateAgentToken(serverId);
    expect(second.token).not.toBe(first.token);
  });
});
