import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { logAuditAction, queryAuditLogs, cleanupAuditLogs } from '@shulkr/backend/services/audit_service';

describe('audit_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('logAuditAction inserts a row with serialized details', async () => {
    await logAuditAction(deps, {
      userId: 1,
      username: 'alice',
      action: 'server.create',
      resourceType: 'server',
      resourceId: 'srv-123',
      details: { name: 'survival' },
      ip: '192.168.1.1',
    });

    const result = await queryAuditLogs(deps, { resourceType: 'server' });
    expect(result.total).toBeGreaterThanOrEqual(1);
    const found = result.logs.find((log) => log.action === 'server.create');
    expect(found?.username).toBe('alice');
    expect(found?.details).toBe('{"name":"survival"}');
  });

  it('queryAuditLogs filters by resourceId', async () => {
    await logAuditAction(deps, {
      userId: null,
      username: null,
      action: 'server.delete',
      resourceType: 'server',
      resourceId: 'srv-target',
    });

    const result = await queryAuditLogs(deps, { resourceId: 'srv-target' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('server.delete');
  });

  it('cleanupAuditLogs accepts daysToKeep without crashing', async () => {
    const removed = await cleanupAuditLogs(deps, 90);
    expect(typeof removed).toBe('number');
  });
});
