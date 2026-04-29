import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { agentIngestService } from '@shulkr/backend/services/agent_ingest_service';

describe('agent_ingest_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('exposes the singleton with ingest / getLive / queryHistory / initialize / shutdown', () => {
    expect(typeof agentIngestService.ingest).toBe('function');
    expect(typeof agentIngestService.getLive).toBe('function');
    expect(typeof agentIngestService.queryHistory).toBe('function');
    expect(typeof agentIngestService.initialize).toBe('function');
    expect(typeof agentIngestService.shutdown).toBe('function');
  });

  it('getLive returns null for an unknown server', () => {
    expect(agentIngestService.getLive('srv-unknown')).toBeNull();
  });

  it('queryHistory returns [] for a server with no metrics', () => {
    const result = agentIngestService.queryHistory('srv-empty', '24h');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });
});
