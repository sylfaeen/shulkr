import { describe, it, expect } from 'vitest';
import { createTestDeps, cleanupTestDeps } from '@shulkr/backend/test/createTestDeps';
import { getAvatar } from '@shulkr/backend/services/avatar_service';

describe('avatar_service', () => {
  it('exposes getAvatar(deps, uuid, size)', () => {
    const deps = createTestDeps();
    expect(typeof getAvatar).toBe('function');
    expect(getAvatar.length).toBe(3);
    cleanupTestDeps(deps);
  });
});
