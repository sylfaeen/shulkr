import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { servers as serversTable } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer } from '@shulkr/backend/test/seed';

// Story 59.1, Server lifecycle. The api/servers.ts route is still on the legacy facade (route migration deferred to a future cleanup), so tests below exercise the full HTTP stack via app.inject and assert on the resulting DB state + audit log entries. Lifecycle endpoints that would actually spawn `java` (start / stop / restart / backup) are NOT tested here, they require a fake ShellRunner injected into serverProcessManager / backup_service, which is part of the deferred 58.7 cleanup.
describe('servers routes (story 59.1)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });

  // AC1: create happy path. POST /api/servers writes the row, materialises the server directory under the sandboxed SERVERS_BASE_PATH (eula.txt + server.properties), and writes an audit log of action=create. Unblocked in 58.11 + 58.12: firewall_service routes its sudo subs_firewall.sh call through deps.shell which is FakeShellRunner in tests (no real sudo prompt), and serverSetupService.initializeServer runs against the FakeFsAdapter via getAppDeps().
  it('AC1: POST /api/servers writes a row and an audit log on success', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['servers:create'],
    });

    const name = `create-test-${Math.random().toString(36).slice(2, 8)}`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: admin.headers,
      payload: { name, min_ram: '1G', max_ram: '2G' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; name: string; java_port: number };
    expect(body.name).toBe(name);
    expect(body.java_port).toBeGreaterThan(0);

    const [row] = await testApp.deps.db.select().from(serversTable).where(eq(serversTable.id, body.id));
    expect(row).toBeDefined();
    expect(row.name).toBe(name);
    expect(row.min_ram).toBe('1G');
    expect(row.max_ram).toBe('2G');

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action, resource_type FROM audit_logs WHERE resource_id = ? AND action = 'create'`)
      .get(body.id) as { action: string; resource_type: string } | undefined;
    expect(audit?.resource_type).toBe('server');
  });

  // AC2: create, RBAC. Without the servers:create permission the POST must be refused with 403 and no row inserted.
  it('AC2: POST /api/servers without servers:create returns 403 and inserts nothing', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });

    const before = await testApp.deps.db.select().from(serversTable);
    const beforeCount = before.length;

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: viewer.headers,
      payload: { name: 'should-not-exist', min_ram: '1G', max_ram: '2G' },
    });
    expect(res.statusCode).toBe(403);

    const after = await testApp.deps.db.select().from(serversTable);
    expect(after.length).toBe(beforeCount);
  });

  // AC1 bis: create, port collision returns 409.
  it('AC1 bis: POST /api/servers with a port already in use returns 409', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['servers:create'],
    });
    const taken = 25600;
    seedServer(testApp.deps, { javaPort: taken });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: admin.headers,
      payload: {
        name: `collide-${Math.random().toString(36).slice(2, 6)}`,
        min_ram: '1G',
        max_ram: '2G',
        java_port: taken,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  // AC list: GET /api/servers returns every seeded server.
  it('list: GET /api/servers returns the seeded servers', async () => {
    const auth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['*'] });
    const a = seedServer(testApp.deps);
    const b = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/servers',
      headers: auth.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string }>;
    expect(body.some((s) => s.id === a.id)).toBe(true);
    expect(body.some((s) => s.id === b.id)).toBe(true);
  });

  // AC byId: GET /api/servers/:id returns the server, 404 for unknown.
  it('byId: GET /api/servers/:id returns the server', async () => {
    const auth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['*'] });
    const server = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}`,
      headers: auth.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string };
    expect(body.id).toBe(server.id);
  });

  it('byId: GET /api/servers/:id returns 404 for unknown id', async () => {
    const auth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['*'] });

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/srv-does-not-exist`,
      headers: auth.headers,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string };
    expect(body.code).toMatch(/SERVER_NOT_FOUND/);
  });

  // update: PATCH /api/servers/:id changes fields and writes an audit log.
  it('update: PATCH /api/servers/:id updates fields and writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:general:update'],
    });
    const server = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/servers/${server.id}`,
      headers: admin.headers,
      payload: { min_ram: '2G', max_ram: '4G' },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await testApp.deps.db.select().from(serversTable).where(eq(serversTable.id, server.id));
    expect(row.min_ram).toBe('2G');
    expect(row.max_ram).toBe('4G');

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_id = ? AND action = 'update' ORDER BY created_at DESC LIMIT 1`)
      .get(server.id) as { action: string } | undefined;
    expect(audit?.action).toBe('update');
  });

  // AC6 + AC8 (adapted): delete a stopped server. Removes the row + writes audit log. Underlying serverProcessManager has no entry for the seeded server so its status defaults to 'stopped' which lets the delete go. fs.rm with force handles the missing path. The firewall script call swallows its error.
  it('AC6: DELETE /api/servers/:id removes the row and writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:general:delete'],
    });
    const server = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/${server.id}`,
      headers: admin.headers,
    });
    expect(res.statusCode).toBe(200);

    const remaining = await testApp.deps.db.select().from(serversTable).where(eq(serversTable.id, server.id));
    expect(remaining).toHaveLength(0);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_id = ? AND action = 'delete'`)
      .get(server.id) as { action: string } | undefined;
    expect(audit?.action).toBe('delete');
  });

  // AC8: DELETE refused for users without server:general:delete
  it('AC8: DELETE /api/servers/:id without permission returns 403', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });
    const server = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/${server.id}`,
      headers: viewer.headers,
    });
    expect(res.statusCode).toBe(403);

    const stillThere = await testApp.deps.db.select().from(serversTable).where(eq(serversTable.id, server.id));
    expect(stillThere).toHaveLength(1);
  });

  // delete: 404 for unknown id
  it('DELETE /api/servers/:id returns 404 for unknown id', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:general:delete'],
    });

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/srv-does-not-exist`,
      headers: admin.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  // start / stop / restart / backup: not exercised end-to-end (would spawn Java / call iptables / write archives). RBAC for start is asserted here as a partial check.
  it('start: POST /api/servers/:id/start without server:power:start returns 403', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });
    const server = seedServer(testApp.deps);

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/start`,
      headers: viewer.headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it('start: POST /api/servers/:id/start returns 404 for unknown id', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:power:start'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/servers/srv-does-not-exist/start`,
      headers: admin.headers,
    });
    expect(res.statusCode).toBe(404);
  });
});
