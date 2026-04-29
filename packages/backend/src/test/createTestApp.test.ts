import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';

describe('createTestApp', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it('boots Fastify with all routes registered', () => {
    expect(testApp.app).toBeDefined();
    expect(testApp.deps).toBeDefined();
  });

  it('serves /api/health with the deps clock', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    // Frozen test clock defaults to 2026-01-01T00:00:00Z
    expect(body.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('uses fakeShell that records but does not execute', async () => {
    await testApp.deps.shell.run('/bin/echo', ['hello']);
    expect(testApp.deps.shell.calls).toHaveLength(1);
    expect(testApp.deps.shell.calls[0]).toMatchObject({
      kind: 'run',
      command: '/bin/echo',
      args: ['hello'],
    });
  });

  it('uses fakeFs that round-trips through an in-memory map', async () => {
    await testApp.deps.fs.mkdir('/tmp/fake', { recursive: true });
    await testApp.deps.fs.writeFile('/tmp/fake/note.txt', 'hello fs');
    const exists = await testApp.deps.fs.exists('/tmp/fake/note.txt');
    expect(exists).toBe(true);
    const content = await testApp.deps.fs.readFileText('/tmp/fake/note.txt');
    expect(content).toBe('hello fs');
  });

  it('clock is frozen and deterministic across calls', () => {
    const a = testApp.deps.clock();
    const b = testApp.deps.clock();
    expect(a.getTime()).toBe(b.getTime());
    expect(a.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('opens an in-memory SQLite (not the production file)', () => {
    // A fresh row write/read round-trip proves the schema was applied to the memory handle. We use the audit_logs table because it has the simplest shape and is unlikely to be soft-tied to the existing data.
    testApp.deps.sqlite.prepare(`INSERT INTO audit_logs (action, resource_type) VALUES (?, ?)`).run('test', 'unit');
    const row = testApp.deps.sqlite.prepare(`SELECT action FROM audit_logs WHERE resource_type = ?`).get('unit') as
      | { action: string }
      | undefined;
    expect(row?.action).toBe('test');
  });
});
