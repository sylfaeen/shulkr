import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { queryMetricsHistory, getLatestMetricsEntries } from '@shulkr/backend/services/metrics_history_service';

describe('metrics_history_service', () => {
  let deps: TestDeps;
  let serverId: string;

  beforeAll(() => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('queryMetricsHistory returns [] for a server with no samples', () => {
    const rows = queryMetricsHistory(deps, serverId, '1h');
    expect(rows).toEqual([]);
  });

  it('getLatestMetricsEntries returns rows in chronological order', async () => {
    deps.sqlite
      .prepare(
        `INSERT INTO metrics_history (server_id, cpu, memory, memory_percent, player_count, tps, mspt) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(serverId, 10, 100, 1.5, 0, 20, 5);

    deps.sqlite
      .prepare(
        `INSERT INTO metrics_history (server_id, cpu, memory, memory_percent, player_count, tps, mspt) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(serverId, 20, 200, 3.0, 1, 19, 6);

    const entries = await getLatestMetricsEntries(deps, serverId, 5);
    expect(entries).toHaveLength(2);
    expect(entries[0].cpu).toBe(10);
    expect(entries[1].cpu).toBe(20);
  });
});
