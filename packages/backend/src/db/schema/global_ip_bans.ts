import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const globalIpBans = sqliteTable('global_ip_bans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull().unique(),
  reason: text('reason'),
  banned_by: text('banned_by').notNull(),
  player_name: text('player_name'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type GlobalIpBan = typeof globalIpBans.$inferSelect;
export type NewGlobalIpBan = typeof globalIpBans.$inferInsert;
