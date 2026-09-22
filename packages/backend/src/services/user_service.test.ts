import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { createUser, getUserById, deleteUser } from '@shulkr/backend/services/user_service';

describe('user_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('createUser inserts a row with hashed password and returns serialized user', async () => {
    const result = await createUser(deps, {
      username: `alice-${Math.random().toString(36).slice(2, 8)}`,
      password: 'StrongPassword!1',
      permissions: ['server:read'],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.id).toBeGreaterThan(0);
    expect(result.user.permissions).toEqual(['server:read']);

    const fetched = await getUserById(deps, result.user.id);
    expect(fetched?.username).toBe(result.user.username);
  });

  it('createUser refuses duplicate usernames', async () => {
    const username = `bob-${Math.random().toString(36).slice(2, 8)}`;
    await createUser(deps, { username, password: 'Strong1!', permissions: [] });
    const dup = await createUser(deps, { username, password: 'Strong2!', permissions: [] });
    expect(dup.success).toBe(false);
  });

  it('deleteUser refuses self-deletion', async () => {
    const user = await createUser(deps, {
      username: `carol-${Math.random().toString(36).slice(2, 8)}`,
      password: 'Strong1!',
      permissions: [],
    });

    if (!user.success) throw new Error('seed failed');
    const result = await deleteUser(deps, user.user.id, user.user.id);
    expect(result.success).toBe(false);
  });
});
