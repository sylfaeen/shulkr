import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { getServerMetrics, isServerRunning, invalidateMetricsCache } from '@shulkr/backend/services/metrics_service';

describe('metrics_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('getServerMetrics returns null for a server that is not running', async () => {
    const result = await getServerMetrics(deps, 'srv-not-running');
    expect(result).toBeNull();
  });

  it('isServerRunning returns false for unknown server', () => {
    expect(isServerRunning('srv-unknown')).toBe(false);
  });

  it('invalidateMetricsCache is a no-op when no entry exists', () => {
    expect(() => invalidateMetricsCache('srv-unknown')).not.toThrow();
  });
});
