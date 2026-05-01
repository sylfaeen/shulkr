import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { sftpAccounts } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer } from '@shulkr/backend/test/seed';

// Story 59.5 ACs adapted to the actual contract.
// The route is /api/sftp (global), not per-server. Username is passed as-is to subs_sftp.sh; the script handles the actual chroot/sshd_match plumbing, so AC2 (server-prefixed username) and AC3 (sshd_match config writes) are not observable from the backend layer and are documented as gaps. AC4 (duplicate username same server) and AC5 (reuse across servers) covered by story 59.8.
describe('sftp routes (story 59.5)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    testApp.deps.shell.reset();
    testApp.deps.sqlite.exec('DELETE FROM sftp_accounts;');
    testApp.deps.sqlite.exec('DELETE FROM servers;');
    testApp.deps.sqlite.exec('DELETE FROM audit_logs;');
  });

  it('AC1: POST /api/sftp inserts an account, calls subs_sftp.sh create-user, writes audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-sftp' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: {
        serverId: server.id,
        username: 'alice',
        password: 'StrongPass1!',
        permissions: 'read-write',
        allowedPaths: ['/world'],
      },
    });

    expect(res.statusCode).toBe(201);

    const createCall = testApp.deps.shell.calls.find(
      (c) => c.kind === 'run' && c.command === 'sudo' && c.args.includes('create-user') && c.args.includes('alice')
    );

    expect(createCall).toBeDefined();

    const [row] = await testApp.deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.username, 'alice'));
    expect(row).toBeDefined();
    expect(row.server_id).toBe(server.id);
    expect(row.permissions).toBe('read-write');

    const audit = testApp.deps.sqlite
      .prepare(
        `SELECT action, resource_type, resource_id FROM audit_logs WHERE resource_type = 'sftp_account' AND action = 'create'`
      )
      .get() as { action: string; resource_type: string; resource_id: string } | undefined;

    expect(audit?.action).toBe('create');
    expect(audit?.resource_id).toBe(server.id);
  });

  it('AC1 gap (AC2 in story): username is passed as-is to the script, no server-id prefix is added', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-prefix' });

    await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'plain', password: 'StrongPass1!' },
    });

    const createCall = testApp.deps.shell.calls.find((c) => c.args.includes('create-user'));
    // Document the gap: subs_sftp.sh receives the bare username `plain`, not a `srv-<id>-plain` prefix. The server path is passed as a separate argument for chroot, but the username itself is unmodified. If AC2 server-prefix isolation is required at the backend layer, open a follow-up bug.
    expect(createCall?.args).toContain('plain');
    expect(createCall?.args).not.toContain(`${server.id}-plain`);
  });

  it('AC6: PATCH /api/sftp/:id with new password calls update-password and writes audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:sftp:create', 'server:sftp:update'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-update' });

    const createRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'bob', password: 'OldPass11!' },
    });

    const created = createRes.json() as { id: number };
    testApp.deps.shell.reset();

    const patchRes = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/sftp/${created.id}`,
      headers: admin.headers,
      payload: { id: created.id, password: 'NewPass22!' },
    });

    expect(patchRes.statusCode).toBe(200);

    const updateCall = testApp.deps.shell.calls.find((c) => c.args.includes('update-password') && c.args.includes('bob'));
    expect(updateCall).toBeDefined();

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_type = 'sftp_account' AND action = 'update'`)
      .get() as { action: string } | undefined;

    expect(audit?.action).toBe('update');
  });

  it('AC7: DELETE /api/sftp/:id calls delete-user and removes the row', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:sftp:create', 'server:sftp:delete'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-delete' });

    const createRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'charlie', password: 'StrongPass1!' },
    });

    const created = createRes.json() as { id: number };
    testApp.deps.shell.reset();

    const delRes = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/sftp/${created.id}`,
      headers: admin.headers,
    });

    expect(delRes.statusCode).toBe(200);

    const deleteCall = testApp.deps.shell.calls.find((c) => c.args.includes('delete-user') && c.args.includes('charlie'));
    expect(deleteCall).toBeDefined();

    const rows = await testApp.deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.id, created.id));
    expect(rows.length).toBe(0);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_type = 'sftp_account' AND action = 'delete'`)
      .get() as { action: string } | undefined;

    expect(audit?.action).toBe('delete');
  });

  it('AC9: user without server:sftp:create receives 403 and triggers no shell call', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });
    const server = seedServer(testApp.deps, { name: 'srv-rbac' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: viewer.headers,
      payload: { serverId: server.id, username: 'denied', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(403);

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('create-user'))).toBeUndefined();
  });

  it('AC10: password shorter than 8 chars is rejected by Zod with 400 before any shell call', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-shortpw' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'short', password: 'short' },
    });

    expect(res.statusCode).toBe(400);

    expect(testApp.deps.shell.calls.length).toBe(0);
  });

  it('AC11: shell-injection attempt in username is rejected by Zod regex with 400, no shell call', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-inject' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'alice; rm -rf /', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(400);

    expect(testApp.deps.shell.calls.length).toBe(0);

    const rows = await testApp.deps.db.select().from(sftpAccounts);
    expect(rows.length).toBe(0);
  });

  it('AC1 (story 59.9): password containing a newline is rejected by Zod with 400, no shell call (chpasswd injection defense)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-nl-inject' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'alice', password: 'ValidPass1\nroot:hijacked' },
    });

    expect(res.statusCode).toBe(400);

    expect(testApp.deps.shell.calls.length).toBe(0);

    const rows = await testApp.deps.db.select().from(sftpAccounts);
    expect(rows.length).toBe(0);
  });

  it('AC4 (story 59.8): duplicate username on the same server returns 409, no shell call, no extra row', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-dup-same' });

    const first = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'alice', password: 'StrongPass1!' },
    });

    expect(first.statusCode).toBe(201);
    testApp.deps.shell.reset();

    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: server.id, username: 'alice', password: 'OtherPass2!' },
    });

    expect(second.statusCode).toBe(409);
    const body = second.json() as { code: string; message: string };
    expect(body.code).toBe('SFTP_USERNAME_TAKEN');
    expect(body.message).not.toContain('UNIQUE constraint');

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('create-user'))).toBeUndefined();

    const rows = await testApp.deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.username, 'alice'));
    expect(rows.length).toBe(1);
  });

  it('AC5 (story 59.8): reusing a username on another server also returns 409 (constraint is global)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:sftp:create'] });
    const serverA = seedServer(testApp.deps, { name: 'srv-A' });
    const serverB = seedServer(testApp.deps, { name: 'srv-B' });

    await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: serverA.id, username: 'shared', password: 'StrongPass1!' },
    });

    testApp.deps.shell.reset();

    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/sftp',
      headers: admin.headers,
      payload: { serverId: serverB.id, username: 'shared', password: 'OtherPass2!' },
    });

    expect(second.statusCode).toBe(409);
    expect((second.json() as { code: string }).code).toBe('SFTP_USERNAME_TAKEN');

    expect(testApp.deps.shell.calls.find((c) => c.args.includes('create-user'))).toBeUndefined();

    const rows = await testApp.deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.username, 'shared'));
    expect(rows.length).toBe(1);
    expect(rows[0].server_id).toBe(serverA.id);
  });

  it('list: GET /api/sftp?serverId=... returns the accounts for that server', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:sftp:create', 'server:sftp:list'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-list' });

    for (const username of ['ann', 'ben', 'chris']) {
      await testApp.app.inject({
        method: 'POST',
        url: '/api/sftp',
        headers: admin.headers,
        payload: { serverId: server.id, username, password: 'StrongPass1!' },
      });
    }

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/sftp?serverId=${server.id}`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { accounts: Array<{ username: string }> };
    expect(body.accounts.map((a) => a.username).sort()).toEqual(['ann', 'ben', 'chris']);
  });
});
