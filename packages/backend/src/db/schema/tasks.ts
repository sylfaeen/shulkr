import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from './servers';

export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<'restart' | 'backup' | 'command'>().notNull(),
  cron_expression: text('cron_expression').notNull(), // e.g., "0 4 * * *"
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }).$type<TaskConfig>(), // JSON for type-specific config
  last_run: text('last_run'), // ISO timestamp
  next_run: text('next_run'), // ISO timestamp
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export interface TaskConfig {
  // For 'command' type
  command?: string;
  // For 'backup' type
  backup_paths?: Array<string>;
  // For 'restart' type
  warn_players?: boolean;
  warn_message?: string;
  warn_seconds?: number;
}

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
