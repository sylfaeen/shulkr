import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { generateId } from '@shulkr/backend/lib/id';

export const servers = sqliteTable('servers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text('name').notNull(),
  path: text('path').notNull(), // Path to server directory
  jar_file: text('jar_file'), // JAR filename (e.g., "paper-1.20.4.jar") — null until admin configures it
  min_ram: text('min_ram').notNull().default('1G'),
  max_ram: text('max_ram').notNull().default('2G'),
  jvm_flags: text('jvm_flags').notNull().default(''), // Additional JVM flags
  java_port: integer('java_port').notNull().default(25565),
  java_path: text('java_path'), // Custom Java binary path (null = system default)
  auto_start: integer('auto_start', { mode: 'boolean' }).notNull().default(false),
  deleting: integer('deleting', { mode: 'boolean' }).notNull().default(false),
  max_backups: integer('max_backups').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
