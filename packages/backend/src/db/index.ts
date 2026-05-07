import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from '@shulkr/backend/db/schema';
import { DATABASE_PATH } from '@shulkr/backend/services/paths';

export type SqliteHandle = DatabaseType;
export type DbClient = ReturnType<typeof drizzle<typeof schema>>;
export { DATABASE_PATH };

// Story 58.10: factories only. No more `db` / `sqlite` singleton exports. Production opens its handle in `createDeps`; tests open theirs in `createTestDeps`. The schema import stays here since it's pure data.
export function createSqlite(path: string = DATABASE_PATH): SqliteHandle {
  if (path !== ':memory:') {
    const dataDir = dirname(path);

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  return new Database(path);
}

export function createDb(handle: SqliteHandle): DbClient {
  return drizzle(handle, { schema });
}
