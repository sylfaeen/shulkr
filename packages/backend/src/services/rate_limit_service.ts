import { sqlite } from '@shulkr/backend/db';
import { ErrorCodes } from '@shulkr/shared';
import type { Statement } from 'better-sqlite3';

let upsertStmt: Statement;
let getStmt: Statement;
let deleteStmt: Statement;
let cleanupStmt: Statement;

function stmts() {
  if (!upsertStmt) {
    upsertStmt = sqlite.prepare(`
      INSERT INTO rate_limits (key, count, first_at, reset_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1
    `);
    getStmt = sqlite.prepare(`SELECT count, first_at, reset_at FROM rate_limits WHERE key = ?`);
    deleteStmt = sqlite.prepare(`DELETE FROM rate_limits WHERE key = ?`);
    cleanupStmt = sqlite.prepare(`DELETE FROM rate_limits WHERE reset_at <= ?`);
  }
  return { upsertStmt, getStmt, deleteStmt, cleanupStmt };
}

interface RateLimitRow {
  count: number;
  first_at: number;
  reset_at: number;
}

export function checkRateLimit(key: string, max: number, windowMs: number): void {
  const { getStmt, upsertStmt, deleteStmt } = stmts();
  const now = Date.now();
  const row = getStmt.get(key) as RateLimitRow | undefined;
  if (row && now < row.reset_at) {
    if (row.count >= max) {
      throw { status: 429 as const, body: { code: ErrorCodes.RATE_LIMITED, message: ErrorCodes.RATE_LIMITED } };
    }
    upsertStmt.run(key, now, now + windowMs);
  } else {
    if (row) deleteStmt.run(key);
    upsertStmt.run(key, now, now + windowMs);
  }
}

export function checkLoginLockout(key: string, maxAttempts: number, windowMs: number): void {
  const { getStmt } = stmts();
  const now = Date.now();
  const row = getStmt.get(key) as RateLimitRow | undefined;
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

export function recordLoginFailure(key: string, windowMs: number): void {
  const { getStmt, upsertStmt, deleteStmt } = stmts();
  const now = Date.now();
  const row = getStmt.get(key) as RateLimitRow | undefined;
  if (!row || now - row.first_at >= windowMs) {
    if (row) deleteStmt.run(key);
    upsertStmt.run(key, now, now + windowMs);
  } else {
    upsertStmt.run(key, row.first_at, row.first_at + windowMs);
  }
}

export function clearLoginFailures(key: string): void {
  stmts().deleteStmt.run(key);
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
  try {
    stmts().cleanupStmt.run(Date.now());
  } catch {}
}, 5 * 60_000);
