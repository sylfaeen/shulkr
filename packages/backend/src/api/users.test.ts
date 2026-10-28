import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedUser, seedAuthenticatedUser } from '@shulkr/backend/test/seed';

// Spec note: the story (59.4) was written against an abstract `email/role` model. The actual contract uses `username` + granular `permissions`. The tests below adapt each AC to the real schema while preserving the intent.
describe('users routes (story 59.4)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  // AC1: create user, admin authorised, password hashed, audit log written
  it('AC1: POST /api/users with users:manage:create stores a bcrypt hash and writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:create'],
    });

    const username = `ac1-${Math.random().toString(36).slice(2, 8)}`;

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: admin.headers,
      payload: { username, password: 'StrongPass1!', permissions: ['server:console:read'] },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; username: string; permissions: Array<string> };
    expect(body.username).toBe(username);
    expect(body.permissions).toEqual(['server:console:read']);

    const [row] = await testApp.deps.db.select().from(users).where(eq(users.id, body.id));
    expect(row.password_hash).not.toBe('StrongPass1!');
    expect(await bcrypt.compare('StrongPass1!', row.password_hash)).toBe(true);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action, resource_type FROM audit_logs WHERE resource_id = ? AND action = 'create'`)
      .get(String(body.id)) as { action: string; resource_type: string } | undefined;

    expect(audit?.resource_type).toBe('user');
  });

  // AC2: duplicate username returns 409
  it('AC2: POST /api/users with an existing username returns 409', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:create'],
    });

    const existing = await seedUser(testApp.deps);

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: admin.headers,
      payload: { username: existing.username, password: 'StrongPass1!', permissions: [] },
    });

    expect(res.statusCode).toBe(409);
  });

  // AC3: weak password rejected by Zod (min 8 chars + letters + digits)
  it('AC3: POST /api/users with a weak password returns 400', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:create'],
    });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: admin.headers,
      payload: { username: 'whoever', password: 'abc', permissions: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  // AC4: PATCH /:id updates username + permissions, writes audit log
  it('AC4: PATCH /api/users/:id updates username + permissions and writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:update'],
    });

    const target = await seedUser(testApp.deps, { permissions: [] });

    const newUsername = `renamed-${Math.random().toString(36).slice(2, 8)}`;

    const res = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/users/${target.id}`,
      headers: admin.headers,
      payload: { username: newUsername, permissions: ['server:console:read'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { username: string; permissions: Array<string> };
    expect(body.username).toBe(newUsername);
    expect(body.permissions).toEqual(['server:console:read']);

    const [row] = await testApp.deps.db.select().from(users).where(eq(users.id, target.id));
    expect(row.username).toBe(newUsername);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_id = ? AND action = 'update' ORDER BY created_at DESC LIMIT 1`)
      .get(String(target.id)) as { action: string } | undefined;

    expect(audit?.action).toBe('update');
  });

  // AC5: password change bumps token_version. There is no separate password endpoint in this contract; the rotation happens on the same PATCH /:id endpoint when the password field is provided.
  it('AC5: PATCH /api/users/:id password field bumps token_version (existing tokens become stale)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:update'],
    });

    const target = await seedUser(testApp.deps);

    const [before] = await testApp.deps.db.select().from(users).where(eq(users.id, target.id));
    expect(before.token_version).toBe(0);

    const res = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/users/${target.id}`,
      headers: admin.headers,
      payload: { password: 'NewStrongPass2!' },
    });

    expect(res.statusCode).toBe(200);

    const [after] = await testApp.deps.db.select().from(users).where(eq(users.id, target.id));
    expect(after.token_version).toBe(before.token_version + 1);
  });

  // AC6: hard delete (DELETE /api/users/:id) removes the row + writes audit
  it('AC6: DELETE /api/users/:id removes the row and writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:delete'],
    });

    const target = await seedUser(testApp.deps);

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);

    const remaining = await testApp.deps.db.select().from(users).where(eq(users.id, target.id));
    expect(remaining).toHaveLength(0);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE resource_id = ? AND action = 'delete'`)
      .get(String(target.id)) as { action: string } | undefined;

    expect(audit?.action).toBe('delete');
  });

  // AC7: self-deletion is refused
  it('AC7: DELETE /api/users/:id refuses self-deletion', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:delete'],
    });

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/${admin.id}`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    const [stillThere] = await testApp.deps.db.select().from(users).where(eq(users.id, admin.id));
    expect(stillThere).toBeDefined();
  });

  // AC8: deleting a user with active sessions also drops the sessions (verifies the cascade in user_service.deleteUser)
  it('AC8: DELETE /api/users/:id removes the user and cascades to their sessions', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:delete'],
    });

    const target = await seedUser(testApp.deps);

    testApp.deps.sqlite
      .prepare(`INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES (?, ?, ?)`)
      .run(target.id, `tok-${Math.random()}`, '2099-01-01T00:00:00Z');

    const before = testApp.deps.sqlite.prepare(`SELECT COUNT(*) as count FROM sessions WHERE user_id = ?`).get(target.id) as {
      count: number;
    };

    expect(before.count).toBeGreaterThan(0);

    await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: admin.headers,
    });

    const after = testApp.deps.sqlite.prepare(`SELECT COUNT(*) as count FROM sessions WHERE user_id = ?`).get(target.id) as {
      count: number;
    };

    expect(after.count).toBe(0);
  });

  // AC9: documents the current behaviour of audit_logs after user deletion. Schema: audit_logs.user_id has no FK constraint and `username` is a snapshot column, so logs survive the delete with their attribution intact. Test enforces this contract.
  it('AC9: audit_logs survive a user deletion with their original userId+username', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:delete'],
    });

    const target = await seedUser(testApp.deps);

    testApp.deps.sqlite
      .prepare(`INSERT INTO audit_logs (user_id, username, action, resource_type) VALUES (?, ?, 'historical_action', 'whatever')`)
      .run(target.id, target.username);

    await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: admin.headers,
    });

    const survivor = testApp.deps.sqlite
      .prepare(`SELECT user_id, username FROM audit_logs WHERE action = 'historical_action' AND user_id = ?`)
      .get(target.id) as { user_id: number; username: string } | undefined;

    expect(survivor).toBeDefined();
    expect(survivor?.user_id).toBe(target.id);
    expect(survivor?.username).toBe(target.username);
  });

  // AC10 (adapted): GET /api/users returns every seeded user. The original AC asked to filter by `role`, but the contract has no role filter, the permission system is granular. Test that the endpoint at least lists.
  it('AC10 (adapted): GET /api/users returns the full user list (no role filter in contract)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:list'],
    });

    const a = await seedUser(testApp.deps);
    const b = await seedUser(testApp.deps);

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: number; username: string }>;
    expect(body.some((u) => u.id === a.id)).toBe(true);
    expect(body.some((u) => u.id === b.id)).toBe(true);
  });

  // AC11: RBAC, a viewer (no users:manage:* permission) cannot CUD
  it('AC11: a user without users:manage permissions gets 403 on POST and DELETE', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });
    const target = await seedUser(testApp.deps);

    const createRes = await testApp.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: viewer.headers,
      payload: { username: 'forbidden', password: 'StrongPass1!', permissions: [] },
    });

    expect(createRes.statusCode).toBe(403);

    const deleteRes = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/${target.id}`,
      headers: viewer.headers,
    });

    expect(deleteRes.statusCode).toBe(403);
  });

  // AC12: the seed admin (id=1) is protected from deletion. The current implementation hardcodes id=1 as the protected admin (see api/users.ts). This test pins that contract.
  it('AC12: DELETE /api/users/1 is refused (USER_PROTECTED) regardless of permission', async () => {
    // Ensure user id=1 exists; if our seedUser already produced it (auto- increment from a fresh :memory: db) we're fine, otherwise insert.
    const [existing] = await testApp.deps.db.select().from(users).where(eq(users.id, 1));

    if (!existing) {
      testApp.deps.sqlite
        .prepare(`INSERT INTO users (id, username, password_hash, permissions) VALUES (1, 'first-admin', 'h', '["*"]')`)
        .run();
    }

    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['users:manage:delete'],
    });

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/users/1`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { code: string };
    expect(body.code).toMatch(/USER_PROTECTED/);
  });
});
