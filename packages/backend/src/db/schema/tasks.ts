import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<'restart' | 'backup' | 'command' | 'chain'>().notNull(),
  cron_expression: text('cron_expression').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }).$type<TaskConfig>(),
  last_run: text('last_run'),
  next_run: text('next_run'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export interface ConditionRule {
  type: 'server_status' | 'player_count' | 'time_range';
  config: Record<string, unknown>;
}

export interface TaskConditions {
  logic: 'and' | 'or';
  rules: Array<ConditionRule>;
}

export interface ChainStep {
  type: 'backup' | 'restart' | 'command' | 'delay' | 'webhook';
  config: Record<string, unknown>;
  onError: 'stop' | 'continue';
}

export interface TaskConfig {
  command?: string;
  backup_paths?: Array<string>;
  warn_players?: boolean;
  warn_message?: string;
  warn_seconds?: number;
  steps?: Array<ChainStep>;
  conditions?: TaskConditions;
}

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
