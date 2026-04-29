import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';
import { ErrorCodes } from '@shulkr/shared';

type Deps = Pick<AppDeps, 'sqlite' | 'clock'>;

interface RateLimitRow {
  count: number;
  first_at: number;
  reset_at: number;
}

const SQL_UPSERT = `
  INSERT INTO rate_limits (key, count, first_at, reset_at)
  VALUES (?, 1, ?, ?)
  ON CONFLICT(key) DO UPDATE SET count = count + 1
`;
const SQL_GET = `SELECT count, first_at, reset_at FROM rate_limits WHERE key = ?`;
const SQL_DELETE = `DELETE FROM rate_limits WHERE key = ?`;
const SQL_CLEANUP = `DELETE FROM rate_limits WHERE reset_at <= ?`;

export function rateLimitCheck(deps: Deps, key: string, max: number, windowMs: number): void {
  const now = deps.clock().getTime();
  const row = deps.sqlite.prepare(SQL_GET).get(key) as RateLimitRow | undefined;

  if (row && now < row.reset_at) {
    if (row.count >= max) {
      throw { status: 429 as const, body: { code: ErrorCodes.RATE_LIMITED, message: ErrorCodes.RATE_LIMITED } };
    }
    deps.sqlite.prepare(SQL_UPSERT).run(key, now, now + windowMs);
  } else {
    if (row) deps.sqlite.prepare(SQL_DELETE).run(key);
    deps.sqlite.prepare(SQL_UPSERT).run(key, now, now + windowMs);
  }
}

export function rateLimitCheckLoginLockout(deps: Deps, key: string, maxAttempts: number, windowMs: number): void {
  const now = deps.clock().getTime();
  const row = deps.sqlite.prepare(SQL_GET).get(key) as RateLimitRow | undefined;

  if (row && row.count >= maxAttempts && now - row.first_at < windowMs) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - row.first_at)) / 1000);
    console.warn(`Login lockout triggered for ${key} (${row.count} failed attempts)`);
    throw {
      status: 429 as const,
      body: { code: ErrorCodes.RATE_LIMITED, message: ErrorCodes.RATE_LIMITED },
      headers: { 'Retry-After': String(retryAfterSeconds) },
    };
  }
}

export function rateLimitRecordLoginFailure(deps: Deps, key: string, windowMs: number): void {
  const now = deps.clock().getTime();
  const row = deps.sqlite.prepare(SQL_GET).get(key) as RateLimitRow | undefined;

  if (!row || now - row.first_at >= windowMs) {
    if (row) deps.sqlite.prepare(SQL_DELETE).run(key);
    deps.sqlite.prepare(SQL_UPSERT).run(key, now, now + windowMs);
  } else {
    deps.sqlite.prepare(SQL_UPSERT).run(key, row.first_at, row.first_at + windowMs);
  }
}

export function rateLimitClearLoginFailures(deps: Deps, key: string): void {
  deps.sqlite.prepare(SQL_DELETE).run(key);
}

export function checkRateLimit(key: string, max: number, windowMs: number): void {
  rateLimitCheck(getAppDeps(), key, max, windowMs);
}

export function checkLoginLockout(key: string, maxAttempts: number, windowMs: number): void {
  rateLimitCheckLoginLockout(getAppDeps(), key, maxAttempts, windowMs);
}

export function recordLoginFailure(key: string, windowMs: number): void {
  rateLimitRecordLoginFailure(getAppDeps(), key, windowMs);
}

export function clearLoginFailures(key: string): void {
  rateLimitClearLoginFailures(getAppDeps(), key);
}

// Background cleanup of expired entries. Disabled in tests so Vitest doesn't keep workers alive on a 5-minute timer (and so each :memory: handle stays untouched between tests).
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    try {
      getAppDeps().sqlite.prepare(SQL_CLEANUP).run(getAppDeps().clock().getTime());
    } catch {}
  }, 5 * 60_000).unref();
}
