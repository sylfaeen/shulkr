import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { getServerStrategyWithDeps, setServerStrategyWithDeps } from '@shulkr/backend/services/cloud_backup_strategy';

describe('cloud_backup_strategy', () => {
  let deps: TestDeps;
  let serverId: string;

  beforeAll(() => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('getServerStrategyWithDeps defaults to local-only when unset', async () => {
    const strategy = await getServerStrategyWithDeps(deps, serverId);
    expect(strategy).toEqual({ mode: 'local-only' });
  });

  it('setServerStrategyWithDeps + getServerStrategyWithDeps round-trip', async () => {
    await setServerStrategyWithDeps(deps, serverId, { mode: 'hybrid', cloudDestinationId: 'dest-123' });
    const strategy = await getServerStrategyWithDeps(deps, serverId);
    expect(strategy).toEqual({ mode: 'hybrid', cloudDestinationId: 'dest-123' });
  });
});
