import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { generateId } from '@shulkr/backend/lib/id';

export type BackupStrategyMode = 'local-only' | 'cloud-only' | 'hybrid';

export type BackupStrategy = {
  mode: BackupStrategyMode;
  cloudDestinationId?: string;
  localRetentionCount?: number;
  cloudRetentionDays?: number;
};

export const servers = sqliteTable('servers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text('name').notNull(),
  path: text('path').notNull(),
  jar_file: text('jar_file'),
  min_ram: text('min_ram').notNull().default('1G'),
  max_ram: text('max_ram').notNull().default('2G'),
  jvm_flags: text('jvm_flags').notNull().default(''),
  java_port: integer('java_port').notNull().default(25565),
  java_path: text('java_path'),
  auto_start: integer('auto_start', { mode: 'boolean' }).notNull().default(false),
  auto_restart_on_crash: integer('auto_restart_on_crash', { mode: 'boolean' }).notNull().default(false),
  deleting: integer('deleting', { mode: 'boolean' }).notNull().default(false),
  max_backups: integer('max_backups').notNull().default(0),
  backup_strategy: text('backup_strategy', { mode: 'json' }).$type<BackupStrategy>(),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
