import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema';
import { DATABASE_PATH } from '@shulkr/backend/services/paths';

const dataDir = dirname(DATABASE_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const sqlite: DatabaseType = new Database(DATABASE_PATH);
export const db = drizzle(sqlite, { schema });

export { sqlite, DATABASE_PATH };
