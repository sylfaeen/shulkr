import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const playerSessions = sqliteTable('player_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  player_name: text('player_name').notNull(),
  player_uuid: text('player_uuid'),
  ip_address: text('ip_address'),
  joined_at: text('joined_at').notNull(),
  left_at: text('left_at'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type PlayerSession = typeof playerSessions.$inferSelect;
