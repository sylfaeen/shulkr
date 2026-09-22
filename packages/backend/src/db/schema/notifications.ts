import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from '@shulkr/backend/db/schema/users';

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'server_crash' | 'backup_success' | 'backup_failure' | 'alert_triggered' | 'task_failure'
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link'), // optional navigation link e.g. /app/servers/:id/console
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
