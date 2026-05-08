import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { firewallRules } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser } from '@shulkr/backend/test/seed';

// Story 59.6 ACs 8/9/11 adapted to the unified firewall model: rules now carry an `action` (allow|deny) and an optional `from_ip`, with `port` accepting either a single number or a "low:high" range (or null for any).
describe('firewall routes (story 59.6)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    testApp.deps.shell.reset();
    testApp.deps.sqlite.exec('DELETE FROM firewall_rules;');
    testApp.deps.sqlite.exec('DELETE FROM audit_logs;');
  });

  it('AC8: POST /api/firewall with settings:firewall:add inserts an allow rule and calls the firewall script', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: admin.headers,
      payload: { action: 'allow', port: '25565', protocol: 'tcp', label: 'Minecraft default' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; port: string; protocol: string; label: string };
    expect(body.port).toBe('25565');
    expect(body.protocol).toBe('tcp');

    const allowCall = testApp.deps.shell.calls.find(
      (c) =>
        c.kind === 'run' && c.command === 'sudo' && c.args.includes('allow') && c.args.includes('25565') && c.args.includes('tcp')
    );

    expect(allowCall).toBeDefined();

    const [row] = await testApp.deps.db.select().from(firewallRules).where(eq(firewallRules.id, body.id));
    expect(row).toBeDefined();
    expect(row.action).toBe('allow');
    expect(row.label).toBe('Minecraft default');
    expect(row.enabled).toBe(true);
  });

  it('AC8 bis: reserved port (22) is rejected by Zod with 400 before any shell call', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: admin.headers,
      payload: { action: 'allow', port: '22', protocol: 'tcp', label: 'SSH' },
    });

    expect(res.statusCode).toBe(400);

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('allow'))).toBeUndefined();
  });

  it('deny: POST /api/firewall accepts a from-IP only rule (no port)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: admin.headers,
      payload: { action: 'deny', protocol: 'tcp', from_ip: '1.2.3.4', label: 'Block bad guy' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; action: string; port: string | null; from_ip: string | null };
    expect(body.action).toBe('deny');
    expect(body.port).toBeNull();
    expect(body.from_ip).toBe('1.2.3.4');

    const denyCall = testApp.deps.shell.calls.find(
      (c) => c.kind === 'run' && c.command === 'sudo' && c.args.includes('deny') && c.args.includes('1.2.3.4')
    );

    expect(denyCall).toBeDefined();
  });

  it('AC9: DELETE /api/firewall/:ruleId removes the row and calls the inverse action', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add', 'settings:firewall:remove'],
    });

    const addRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: admin.headers,
      payload: { action: 'allow', port: '26000', protocol: 'tcp', label: 'Test' },
    });

    expect(addRes.statusCode).toBe(201);
    const created = addRes.json() as { id: number };
    testApp.deps.shell.reset();

    const delRes = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/firewall/${created.id}`,
      headers: admin.headers,
    });

    expect(delRes.statusCode).toBe(200);

    const denyCall = testApp.deps.shell.calls.find((c) => c.args.includes('deny') && c.args.includes('26000'));
    expect(denyCall).toBeDefined();

    const rows = await testApp.deps.db.select().from(firewallRules).where(eq(firewallRules.id, created.id));
    expect(rows.length).toBe(0);
  });

  it('AC11: user without settings:firewall:add receives 403 and no shell call', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: viewer.headers,
      payload: { action: 'allow', port: '26500', protocol: 'tcp', label: 'Nope' },
    });

    expect(res.statusCode).toBe(403);

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('allow'))).toBeUndefined();

    const rows = await testApp.deps.db.select().from(firewallRules);
    expect(rows.length).toBe(0);
  });

  it('toggle: POST /api/firewall/:ruleId/toggle flips enabled and calls the matching script action', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add', 'settings:firewall:toggle'],
    });

    const addRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/firewall',
      headers: admin.headers,
      payload: { action: 'allow', port: '27000', protocol: 'udp', label: 'UDP test' },
    });

    const created = addRes.json() as { id: number; enabled: boolean };
    expect(created.enabled).toBe(true);
    testApp.deps.shell.reset();

    const toggleRes = await testApp.app.inject({
      method: 'POST',
      url: `/api/firewall/${created.id}/toggle`,
      headers: admin.headers,
    });

    expect(toggleRes.statusCode).toBe(200);
    const toggled = toggleRes.json() as { enabled: boolean };
    expect(toggled.enabled).toBe(false);

    const denyCall = testApp.deps.shell.calls.find((c) => c.args.includes('deny') && c.args.includes('27000'));
    expect(denyCall).toBeDefined();
  });

  it('list: GET /api/firewall returns all rules for an authorised user', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['settings:firewall:add', 'settings:firewall:list'],
    });

    for (const port of ['28001', '28002', '28003']) {
      await testApp.app.inject({
        method: 'POST',
        url: '/api/firewall',
        headers: admin.headers,
        payload: { action: 'allow', port, protocol: 'tcp', label: `Rule ${port}` },
      });
    }

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/firewall',
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { rules: Array<{ port: string }> };
    expect(body.rules.map((r) => r.port).sort()).toEqual(['28001', '28002', '28003']);
  });
});
