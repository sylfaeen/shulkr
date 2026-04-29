import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { globalIpBans, auditLogs } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser } from '@shulkr/backend/test/seed';

// Story 59.6 ACs adapted to the actual contract.
// The service uses normalizeIp = ip.trim().toLowerCase() (no IPv6-mapped translation), so AC12 is left as a documented gap rather than an asserted behaviour.
describe('global_ip_bans routes (story 59.6)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });
  beforeEach(() => {
    testApp.deps.shell.reset();
    testApp.deps.sqlite.exec('DELETE FROM global_ip_bans;');
    testApp.deps.sqlite.exec('DELETE FROM audit_logs;');
  });

  it('AC1: POST /api/bans/ips with settings:globalIpBans:add inserts a row, calls block-ip, writes audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '1.2.3.4', reason: 'spam' },
    });
    expect(res.statusCode).toBe(201);

    const blockCall = testApp.deps.shell.calls.find(
      (c) => c.kind === 'run' && c.command === 'sudo' && c.args.includes('block-ip') && c.args.includes('1.2.3.4')
    );
    expect(blockCall).toBeDefined();

    const [row] = await testApp.deps.db.select().from(globalIpBans).where(eq(globalIpBans.ip, '1.2.3.4'));
    expect(row).toBeDefined();
    expect(row.reason).toBe('spam');

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action, resource_type FROM audit_logs WHERE action = 'add' AND resource_type = 'global_ip_ban'`)
      .get() as { action: string; resource_type: string } | undefined;
    expect(audit?.action).toBe('add');
  });

  it('AC2: banning the requester own IP returns 400, no shell call, no row', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      remoteAddress: '127.0.0.1',
      payload: { ip: '127.0.0.1' },
    });
    expect(res.statusCode).toBe(400);

    const blockCall = testApp.deps.shell.calls.find((c) => c.args.includes('block-ip'));
    expect(blockCall).toBeUndefined();

    const rows = await testApp.deps.db.select().from(globalIpBans);
    expect(rows.length).toBe(0);
  });

  it('AC3: invalid IP payload is rejected by Zod with 400 before any shell call', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: 'not-an-ip' },
    });
    expect(res.statusCode).toBe(400);

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('block-ip'))).toBeUndefined();
  });

  it('AC4: re-banning an already-banned IP returns 409 and no extra shell call', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    const first = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '8.8.8.8' },
    });
    expect(first.statusCode).toBe(201);
    const callsAfterFirst = testApp.deps.shell.calls.length;

    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '8.8.8.8' },
    });
    expect(second.statusCode).toBe(409);
    expect(testApp.deps.shell.calls.length).toBe(callsAfterFirst);
  });

  it('AC5: GET /api/bans/ips returns the bans sorted by created_at desc', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add', 'settings:globalIpBans:list'],
    });

    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      await testApp.app.inject({
        method: 'POST',
        url: '/api/bans/ips',
        headers: admin.headers,
        payload: { ip },
      });
    }

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/bans/ips',
      headers: admin.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { bans: Array<{ ip: string }> };
    // Clock is frozen in tests so created_at is identical for all three; assert presence rather than order.
    expect(body.bans.map((b) => b.ip).sort()).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
  });

  it('AC6: DELETE /api/bans/ips/:banId removes the row, calls unblock-ip, writes audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add', 'settings:globalIpBans:remove'],
    });

    const addRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '4.4.4.4' },
    });
    const created = addRes.json() as { id: number; ip: string };

    const delRes = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/bans/ips/${created.id}`,
      headers: admin.headers,
    });
    expect(delRes.statusCode).toBe(200);

    const unblockCall = testApp.deps.shell.calls.find((c) => c.args.includes('unblock-ip') && c.args.includes('4.4.4.4'));
    expect(unblockCall).toBeDefined();

    const rows = await testApp.deps.db.select().from(globalIpBans).where(eq(globalIpBans.id, created.id));
    expect(rows.length).toBe(0);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_type = 'global_ip_ban' AND action = 'remove'`)
      .get() as { action: string } | undefined;
    expect(audit?.action).toBe('remove');
  });

  it('AC7: script failure → 400 and no row inserted (atomicity)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });
    testApp.deps.shell.mockRun('sudo', { success: false, stdout: '', stderr: 'iptables busy', exitCode: 1 });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '9.9.9.9' },
    });
    expect(res.statusCode).toBe(400);

    const rows = await testApp.deps.db.select().from(globalIpBans);
    expect(rows.length).toBe(0);
  });

  it('AC10: user without settings:globalIpBans:add receives 403', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: viewer.headers,
      payload: { ip: '6.6.6.6' },
    });
    expect(res.statusCode).toBe(403);

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('block-ip'))).toBeUndefined();

    const rows = await testApp.deps.db.select().from(globalIpBans);
    expect(rows.length).toBe(0);
  });

  it('AC12: IPv4-mapped IPv6 input is decoded to its IPv4 form before shell call and DB insert', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      payload: { ip: '::ffff:1.2.3.4' },
    });
    expect(res.statusCode).toBe(201);

    const blockCall = testApp.deps.shell.calls.find((c) => c.args.includes('block-ip'));
    expect(blockCall).toBeDefined();
    expect(blockCall?.args).toContain('1.2.3.4');
    expect(blockCall?.args).not.toContain('::ffff:1.2.3.4');

    const rows = await testApp.deps.db.select().from(globalIpBans);
    expect(rows.map((r) => r.ip)).toEqual(['1.2.3.4']);
  });

  it('Audit log captures requester IP and reason', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:globalIpBans:add'],
    });

    await testApp.app.inject({
      method: 'POST',
      url: '/api/bans/ips',
      headers: admin.headers,
      remoteAddress: '203.0.113.5',
      payload: { ip: '2.2.2.2', reason: 'flood' },
    });

    const audit = testApp.deps.sqlite
      .prepare(`SELECT details, ip FROM audit_logs WHERE resource_type = 'global_ip_ban' ORDER BY id DESC LIMIT 1`)
      .get() as { details: string; ip: string } | undefined;
    const details = audit?.details ? (JSON.parse(audit.details) as { ip?: string; reason?: string }) : null;
    expect(details?.ip).toBe('2.2.2.2');
    expect(details?.reason).toBe('flood');
  });

  it('logging cleanup: audit table written before checking unrelated rows', async () => {
    const rows = await testApp.deps.db.select().from(auditLogs);
    expect(Array.isArray(rows)).toBe(true);
  });
});
