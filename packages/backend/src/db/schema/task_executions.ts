import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { scheduledTasks } from './tasks';

export const taskExecutions = sqliteTable('task_executions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  task_id: integer('task_id')
    .notNull()
    .references(() => scheduledTasks.id, { onDelete: 'cascade' }),
  status: text('status').$type<'success' | 'error'>().notNull(),
  duration_ms: integer('duration_ms').notNull(),
  error: text('error'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type TaskExecution = typeof taskExecutions.$inferSelect;
