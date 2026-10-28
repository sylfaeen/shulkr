import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const serverRestarts = sqliteTable('server_restarts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type ServerRestart = typeof serverRestarts.$inferSelect;
