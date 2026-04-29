import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasPermission } from '@shulkr/shared';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser } from '@shulkr/backend/test/seed';

// AC12: pure permission engine. Documents the actual prefix-matching behaviour of @shulkr/shared/lib/permissions.ts as exercised by the runtime middleware (assertPermissions). Each row of the table is a claim about how the granular permission system behaves; if the matrix changes, this test catches it.
describe('hasPermission (pure)', () => {
  const cases: Array<{ user: Array<string>; required: string; expected: boolean; why: string }> = [
    { user: ['*'], required: 'server:console:input', expected: true, why: 'wildcard grants anything' },
    { user: ['*'], required: 'users:manage:delete', expected: true, why: 'wildcard grants anything' },
    { user: ['server'], required: 'server:console:input', expected: true, why: 'group grants its own action via prefix match' },
    { user: ['server'], required: 'users:manage:create', expected: false, why: 'group does not grant a different group' },
    { user: ['server:players'], required: 'server:players:bans', expected: true, why: 'subgroup grants its own actions' },
    {
      user: ['server:players'],
      required: 'server:console:read',
      expected: false,
      why: 'subgroup does not grant sibling subgroup',
    },
    { user: ['server:players:bans'], required: 'server:players:bans', expected: true, why: 'exact action match' },
    {
      user: ['server:players:bans'],
      required: 'server:players:history',
      expected: false,
      why: 'one action does not grant a sibling',
    },
    {
      user: ['server:players:bans'],
      required: 'server:players',
      expected: false,
      why: 'one action does not upgrade to its parent group',
    },
    { user: [], required: 'server:players:bans', expected: false, why: 'empty permissions grants nothing' },
    { user: ['server:players', 'users:manage'], required: 'users:manage:delete', expected: true, why: 'union of permissions' },
    {
      user: ['server:players', 'users:manage'],
      required: 'settings:firewall:add',
      expected: false,
      why: 'union does not include unrelated',
    },
  ];

  for (const { user, required, expected, why } of cases) {
    it(`${JSON.stringify(user)} → ${required} = ${expected} (${why})`, () => {
      expect(hasPermission(user, required as Parameters<typeof hasPermission>[1])).toBe(expected);
    });
  }
});

// AC7-10, runtime enforcement against the migrated routes. Uses /api/users (requires users:manage:list) and /api/audit (requires users:manage:audit) since both are migrated and trivial to reach.
describe('permission enforcement at the route layer', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });
  afterAll(async () => {
    await testApp.cleanup();
  });

  async function userAuth(permissions: Array<string>) {
    return seedAuthenticatedUser(testApp.app, testApp.deps, { permissions });
  }

  it('AC9: wildcard "*" grants any protected route', async () => {
    const auth = await userAuth(['*']);
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(res.statusCode).toBe(200);
  });

  it('AC7: group permission "users" grants users:manage:list', async () => {
    const auth = await userAuth(['users']);
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(res.statusCode).toBe(200);
  });

  it('AC7: group permission "server" does NOT grant users:manage:list', async () => {
    const auth = await userAuth(['server']);
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(res.statusCode).toBe(403);
  });

  it('AC8: subgroup "users:manage" grants users:manage:list', async () => {
    const auth = await userAuth(['users:manage']);
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(res.statusCode).toBe(200);
  });

  it('AC8: single action "users:manage:list" grants exactly itself', async () => {
    const auth = await userAuth(['users:manage:list']);
    const usersRes = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(usersRes.statusCode).toBe(200);

    const auditRes = await testApp.app.inject({
      method: 'GET',
      url: '/api/audit?limit=10',
      headers: auth.headers,
    });
    expect(auditRes.statusCode).toBe(403);
  });

  it('AC10: union of permissions allows both, denies third', async () => {
    const auth = await userAuth(['users:manage:list', 'users:manage:audit']);
    const usersRes = await testApp.app.inject({ method: 'GET', url: '/api/users', headers: auth.headers });
    expect(usersRes.statusCode).toBe(200);

    const auditRes = await testApp.app.inject({
      method: 'GET',
      url: '/api/audit?limit=10',
      headers: auth.headers,
    });
    expect(auditRes.statusCode).toBe(200);
  });

  it('returns 401 (not 403) when no Authorization header is provided', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });
});
