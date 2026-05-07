import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { parseGcLine, getGcSummary } from '@shulkr/backend/services/gc_service';

describe('gc_service', () => {
  let deps: TestDeps;
  let serverId: string;

  beforeAll(() => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('parseGcLine inserts a row when a G1 GC pause is matched', () => {
    parseGcLine(deps, serverId, '[GC pause (G1 Evacuation Pause) 512M->256M(1024M), 0.0234 secs]');
    const summary = getGcSummary(deps, serverId, 24);
    expect(summary.totalPauses).toBe(1);
    expect(summary.maxDurationMs).toBeCloseTo(23.4, 1);
  });

  it('parseGcLine ignores non-GC lines', () => {
    const otherServer = seedServer(deps).id;
    parseGcLine(deps, otherServer, '[INFO]: random log line');
    const summary = getGcSummary(deps, otherServer, 24);
    expect(summary.totalPauses).toBe(0);
  });

  it('getGcSummary returns empty stats for a server with no events', () => {
    const otherServer = seedServer(deps).id;
    const summary = getGcSummary(deps, otherServer, 24);
    expect(summary).toEqual({ totalPauses: 0, totalDurationMs: 0, maxDurationMs: 0, points: [] });
  });
});
