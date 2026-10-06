import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedUser, seedAuthenticatedUser } from '@shulkr/backend/test/seed';

describe('auth routes (story 59.2)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  // AC1: login with valid credentials
  it('AC1: POST /api/auth/login with correct password returns 200 + access_token', async () => {
    const password = 'CorrectHorseBatteryStaple1!';
    const user = await seedUser(testApp.deps, { password, permissions: ['server'] });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: user.username, password },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      success: true;
      data: { access_token: string; user: { id: number; username: string; permissions: Array<string> } };
    };

    expect(body.success).toBe(true);
    expect(body.data.access_token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.user.permissions).toEqual(['server']);
  });

  // AC2 / AC3: wrong password and unknown user return the same generic 401 (anti-enumeration)
  it('AC2: POST /api/auth/login with wrong password returns 401', async () => {
    const user = await seedUser(testApp.deps, { password: 'CorrectOne!1' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: user.username, password: 'WrongOne!1' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string };
    expect(body.code).toMatch(/AUTH_INVALID/);
  });

  it('AC2: failed login is recorded in the audit log', async () => {
    const user = await seedUser(testApp.deps);

    await testApp.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: user.username, password: 'definitely-wrong' },
    });

    const row = testApp.deps.sqlite
      .prepare(
        `SELECT action, username FROM audit_logs WHERE action = 'login_failed' AND username = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(user.username) as { action: string; username: string } | undefined;

    expect(row?.action).toBe('login_failed');
  });

  it('AC3: POST /api/auth/login with unknown username returns 401 (same code as wrong password)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'never-existed-bob', password: 'whatever' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string };
    expect(body.code).toMatch(/AUTH_INVALID/);
  });

  // AC4: rate limit / lockout after repeated failures
  it('AC4: repeated failed logins from the same IP eventually trigger 429', async () => {
    const user = await seedUser(testApp.deps);
    const responses: Array<number> = [];

    for (let i = 0; i < 12; i++) {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: user.username, password: 'wrong-each-time' },
      });

      responses.push(res.statusCode);
    }

    // Lockout kicks in around attempt 5-10, we just assert at least one 429 showed up before the 12 attempts ran out.
    expect(responses).toContain(429);
  });

  // AC5: protected route without Authorization header returns 401
  it('AC5: protected route without Authorization header returns 401', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });

  // AC6: token whose payload claims a stale token_version is rejected (validates the auth path that protects against stolen-then-revoked tokens after a password change)
  it('AC6: token signed with a stale token_version is rejected', async () => {
    const user = await seedUser(testApp.deps, { permissions: ['*'] });

    const goodToken = testApp.app.jwt.sign({
      sub: user.id,
      username: user.username,
      permissions: ['*'],
      token_version: 0,
    });

    const staleToken = testApp.app.jwt.sign({
      sub: user.id,
      username: user.username,
      permissions: ['*'],
      token_version: 999, // never matches the row's token_version (0)
    });

    const goodRes = await testApp.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${goodToken}` },
    });

    expect(goodRes.statusCode).toBe(200);

    const staleRes = await testApp.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${staleToken}` },
    });

    expect(staleRes.statusCode).toBe(401);
  });

  // AC11: /api/auth/me works when authenticated, returns 401 otherwise
  it('AC11: GET /api/auth/me returns the authenticated user', async () => {
    const auth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server'] });

    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: number; username: string; permissions: Array<string> };
    expect(body.id).toBe(auth.id);
    expect(body.username).toBe(auth.username);
    expect(body.permissions).toEqual(['server']);
  });

  it('AC11: POST /api/auth/logout returns 200 even without a session cookie', async () => {
    const res = await testApp.app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { message: string };
    expect(body.message).toMatch(/Logged out/i);
  });
});
