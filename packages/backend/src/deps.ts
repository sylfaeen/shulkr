import { createDb, createSqlite, type DbClient, type SqliteHandle } from '@shulkr/backend/db';
import { type AppConfig } from '@shulkr/backend/config';
import { createClock, type Clock } from '@shulkr/backend/deps/clock';
import { createLogger, type Logger } from '@shulkr/backend/deps/logger';
import { createShellRunner, type ShellRunner } from '@shulkr/backend/deps/shell_runner';
import { createFsAdapter, type FsAdapter } from '@shulkr/backend/deps/fs_adapter';
import { createEncryption, type Encryption } from '@shulkr/backend/deps/encryption';
import { createS3Adapter, type S3Adapter } from '@shulkr/backend/deps/s3_adapter';

export type AppDeps = {
  db: DbClient;
  sqlite: SqliteHandle;
  shell: ShellRunner;
  fs: FsAdapter;
  clock: Clock;
  logger: Logger;
  encryption: Encryption;
  s3: S3Adapter;
  config: AppConfig;
};

export function createDeps(config: AppConfig): AppDeps {
  const sqlite = createSqlite(config.DATABASE_PATH);
  const db = createDb(sqlite);

  const deps: AppDeps = {
    db,
    sqlite,
    shell: createShellRunner({ dryRun: config.SHELL_DRY_RUN }),
    fs: createFsAdapter(),
    clock: createClock(),
    logger: createLogger({ level: config.LOG_LEVEL }),
    encryption: createEncryption(config),
    s3: createS3Adapter(),
    config,
  };

  // Story 58.11 transitional: legacy facades read deps via getAppDeps(). createApp() also calls setAppDeps, but several boot-time initializers in index.ts (jobQueue, taskScheduler, agentIngest, ...) run BEFORE createApp() and need getAppDeps() to be ready. Setting it here makes the prod boot path symmetric with createTestDeps(). Idempotent rewrite when createApp() runs.
  setAppDeps(deps);

  return deps;
}

let closed = false;

export function closeDeps(deps: AppDeps): void {
  if (closed) return;
  closed = true;

  try {
    deps.sqlite.close();
  } catch {
    // sqlite may already be closed; swallowing keeps shutdown idempotent
  }
}

// Story 58.11 transitional accessor. Used by legacy `xxxService` facades whose consumers (routes, other class-only services) cannot yet receive `deps` explicitly. Callers in 58.10 will pass `deps` directly and this accessor will be removed.
let _appDeps: AppDeps | undefined;

export function setAppDeps(deps: AppDeps): void {
  _appDeps = deps;
}

export function getAppDeps(): AppDeps {
  if (!_appDeps) {
    throw new Error('AppDeps not initialized. Call setAppDeps() first (typically in createApp or createTestApp).');
  }

  return _appDeps;
}

export function clearAppDeps(): void {
  _appDeps = undefined;
}
