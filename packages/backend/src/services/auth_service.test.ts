import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedUser } from '@shulkr/backend/test/seed';
import {
  validateCredentials,
  generateAccessToken,
  login,
  generateRefreshToken,
  createSession,
  validateRefreshToken,
  invalidateSession,
} from '@shulkr/backend/services/auth_service';

describe('auth_service', () => {
  let testApp: TestApp;
  beforeAll(async () => {
    testApp = await createTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });

  it('validateCredentials returns valid for matching password', async () => {
    const user = await seedUser(testApp.deps, { password: 'Hunter2!secure' });
    const result = await validateCredentials(testApp.deps, user.username, 'Hunter2!secure');
    expect(result.valid).toBe(true);
  });

  it('validateCredentials returns invalid for wrong password', async () => {
    const user = await seedUser(testApp.deps, { password: 'CorrectOne!1' });
    const result = await validateCredentials(testApp.deps, user.username, 'WrongOne!1');
    expect(result.valid).toBe(false);
  });

  it('login + refresh token round-trip via deps + jwt', async () => {
    const password = 'RoundTrip!1';
    const user = await seedUser(testApp.deps, { password });
    const result = await login(testApp.deps, testApp.app.jwt, user.username, password);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.access_token).toBeTruthy();
    expect(result.refreshToken).toHaveLength(128);

    const validated = await validateRefreshToken(testApp.deps, result.refreshToken);
    expect(validated.valid).toBe(true);

    await invalidateSession(testApp.deps, result.refreshToken);
    const afterInvalidate = await validateRefreshToken(testApp.deps, result.refreshToken);
    expect(afterInvalidate.valid).toBe(false);
  });

  it('generateAccessToken signs a verifiable JWT', async () => {
    const user = await seedUser(testApp.deps, { permissions: ['server:read'] });
    const dbUser = (testApp.deps.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as
      | {
          id: number;
          username: string;
          permissions: string;
          token_version: number;
          password_hash: string;
          locale: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined)!;
    const token = generateAccessToken(testApp.app.jwt, dbUser);
    const decoded = testApp.app.jwt.verify<{ sub: number; permissions: Array<string> }>(token);
    expect(decoded.sub).toBe(user.id);
    expect(decoded.permissions).toEqual(['server:read']);
  });

  it('generateRefreshToken produces 128-char hex string', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{128}$/);
  });

  it('createSession persists with expires_at in the future', async () => {
    const user = await seedUser(testApp.deps);
    const token = generateRefreshToken();
    await createSession(testApp.deps, user.id, token);
    const row = testApp.deps.sqlite.prepare('SELECT expires_at FROM sessions WHERE refresh_token = ?').get(token) as
      | { expires_at: string }
      | undefined;
    expect(row).toBeDefined();
    expect(new Date(row!.expires_at).getTime()).toBeGreaterThan(testApp.deps.clock().getTime());
  });
});
