import { createDb, createSqlite, type DbClient, type SqliteHandle } from '@shulkr/backend/db';
import { type AppConfig } from '@shulkr/backend/config';
import { createClock, type Clock } from '@shulkr/backend/deps/clock';
import { createLogger, type Logger } from '@shulkr/backend/deps/logger';
import { createShellRunner, type ShellRunner } from '@shulkr/backend/deps/shell_runner';
import { createFsAdapter, type FsAdapter } from '@shulkr/backend/deps/fs_adapter';
import { createDnsResolver, type DnsResolver } from '@shulkr/backend/deps/dns_resolver';
import { createEncryption, type Encryption } from '@shulkr/backend/deps/encryption';
import { createS3Adapter, type S3Adapter } from '@shulkr/backend/deps/s3_adapter';

export type AppDeps = {
  db: DbClient;
  sqlite: SqliteHandle;
  shell: ShellRunner;
  fs: FsAdapter;
  dns: DnsResolver;
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
    dns: createDnsResolver(),
    clock: createClock(),
    logger: createLogger({ level: config.LOG_LEVEL }),
    encryption: createEncryption(config),
    s3: createS3Adapter(),
    config,
  };

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
