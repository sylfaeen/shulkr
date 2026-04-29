import { createDb, createSqlite, type DbClient, type SqliteHandle } from '@shulkr/backend/db';
import { initializeDatabase } from '@shulkr/backend/db/migrate';
import { parseConfig, type AppConfig } from '@shulkr/backend/config';
import { setAppDeps, type AppDeps } from '@shulkr/backend/deps';
import { createFakeShell, type FakeShellRunner } from '@shulkr/backend/test/fakes/fake_shell';
import { createFakeFs, type FakeFsAdapter } from '@shulkr/backend/test/fakes/fake_fs';
import { createFakeLogger } from '@shulkr/backend/test/fakes/fake_logger';
import { createFakeS3, type FakeS3Adapter } from '@shulkr/backend/test/fakes/fake_s3';

// Deterministic 32-byte AES-256-GCM key for tests so encrypt/decrypt round-trip across runs. Never used in production: createDeps reads SHULKR_ENCRYPTION_KEY from env or generates one on disk.
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 'x');

// Per-worker shared sqlite handle. Reusing it across createTestDeps() calls preserves cross-call test state and avoids re-running migrations on every call.
let _sharedSqlite: SqliteHandle | undefined;
let _sharedDb: DbClient | undefined;

function getSharedTestDb(): { sqlite: SqliteHandle; db: DbClient } {
  if (!_sharedSqlite || !_sharedDb) {
    _sharedSqlite = createSqlite(':memory:');
    _sharedDb = createDb(_sharedSqlite);
    void initializeDatabase(_sharedSqlite);
  }
  return { sqlite: _sharedSqlite, db: _sharedDb };
}

export type TestDeps = AppDeps & {
  shell: FakeShellRunner;
  fs: FakeFsAdapter;
  s3: FakeS3Adapter;
};

export type CreateTestDepsOpts = {
  now?: string;
  env?: Partial<NodeJS.ProcessEnv>;
  collectLogs?: boolean;
};

const DEFAULT_NOW = '2026-01-01T00:00:00Z';

export function createTestDeps(opts: CreateTestDepsOpts = {}): TestDeps {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    SHELL_DRY_RUN: 'true',
    LOG_LEVEL: 'silent',
    ...opts.env,
  };
  const config: AppConfig = parseConfig(env);

  const { sqlite, db } = getSharedTestDb();

  const fakeLogger = createFakeLogger({ collect: opts.collectLogs });
  const frozenNow = new Date(opts.now ?? DEFAULT_NOW);

  const deps: TestDeps = {
    db,
    sqlite,
    shell: createFakeShell(),
    fs: createFakeFs(),
    clock: () => new Date(frozenNow),
    logger: fakeLogger.logger,
    encryption: { key: TEST_ENCRYPTION_KEY },
    s3: createFakeS3(),
    config,
  };

  setAppDeps(deps);

  return deps;
}

export function cleanupTestDeps(deps: TestDeps): void {
  deps.shell.reset();
  deps.fs.reset();
  deps.s3.reset();
}

// Drop all rows from every user table. Use in `beforeEach` for state isolation.
export function resetTestDb(): void {
  const { sqlite } = getSharedTestDb();
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{
    name: string;
  }>;
  sqlite.exec('PRAGMA foreign_keys = OFF;');
  for (const { name } of tables) {
    sqlite.exec(`DELETE FROM "${name}";`);
  }
  sqlite.exec('PRAGMA foreign_keys = ON;');
}
