import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import {
  rateLimitCheck,
  rateLimitCheckLoginLockout,
  rateLimitRecordLoginFailure,
  rateLimitClearLoginFailures,
} from '@shulkr/backend/services/rate_limit_service';

describe('rate_limit_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('rateLimitCheck throws 429 once max is exceeded within the window', () => {
    const key = `ratelimit-${Math.random().toString(36).slice(2, 8)}`;
    rateLimitCheck(deps, key, 3, 60_000);
    rateLimitCheck(deps, key, 3, 60_000);
    rateLimitCheck(deps, key, 3, 60_000);
    expect(() => rateLimitCheck(deps, key, 3, 60_000)).toThrow();
  });

  it('rateLimitCheckLoginLockout throws after maxAttempts within window', () => {
    const key = `login-${Math.random().toString(36).slice(2, 8)}`;
    rateLimitRecordLoginFailure(deps, key, 60_000);
    rateLimitRecordLoginFailure(deps, key, 60_000);
    rateLimitRecordLoginFailure(deps, key, 60_000);
    expect(() => rateLimitCheckLoginLockout(deps, key, 3, 60_000)).toThrow();
  });

  it('rateLimitClearLoginFailures resets the counter', () => {
    const key = `clear-${Math.random().toString(36).slice(2, 8)}`;
    rateLimitRecordLoginFailure(deps, key, 60_000);
    rateLimitRecordLoginFailure(deps, key, 60_000);
    rateLimitRecordLoginFailure(deps, key, 60_000);
    rateLimitClearLoginFailures(deps, key);
    // After clear, should be allowed again (no throw)
    expect(() => rateLimitCheckLoginLockout(deps, key, 3, 60_000)).not.toThrow();
  });
});
