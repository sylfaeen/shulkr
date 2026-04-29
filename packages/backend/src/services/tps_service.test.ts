import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { collectTps } from '@shulkr/backend/services/tps_service';

describe('tps_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('collectTps returns nulls for a server with no recorded data', () => {
    const result = collectTps(deps, 'srv-without-data');
    expect(result).toEqual({ tps: null, mspt: null });
  });
});
