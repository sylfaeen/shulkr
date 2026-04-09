import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { scheduledTasks } from './tasks';

export type TaskExecutionStatus = 'pending' | 'running' | 'success' | 'error';

export const taskExecutions = sqliteTable('task_executions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  task_id: integer('task_id')
    .notNull()
    .references(() => scheduledTasks.id, { onDelete: 'cascade' }),
  status: text('status').$type<TaskExecutionStatus>().notNull().default('pending'),
  duration_ms: integer('duration_ms').notNull().default(0),
  error: text('error'),
  started_at: text('started_at'),
  retry_count: integer('retry_count').notNull().default(0),
  max_retries: integer('max_retries').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type TaskExecution = typeof taskExecutions.$inferSelect;
