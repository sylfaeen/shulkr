import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  cpu: real('cpu').notNull(),
  memory: integer('memory').notNull(),
  memory_percent: real('memory_percent').notNull(),
  player_count: integer('player_count').notNull(),
  tps: real('tps'),
  mspt: real('mspt'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type MetricsHistoryEntry = typeof metricsHistory.$inferSelect;
