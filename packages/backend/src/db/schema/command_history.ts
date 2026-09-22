import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from '@shulkr/backend/db/schema/users';
import { servers } from '@shulkr/backend/db/schema/servers';

export const commandHistory = sqliteTable('command_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  command: text('command').notNull(),
  use_count: integer('use_count').notNull().default(1),
  last_used_at: text('last_used_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type CommandHistoryEntry = typeof commandHistory.$inferSelect;
