import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

/**
 * Per-server metrics pushed by the shulkr-core plugin.
 *
 * IMPORTANT: this table is kept SEPARATE from `metrics_history` on purpose.
 * The panel must behave identically with or without the plugin installed, so
 * the existing metrics pipeline (metrics_service + tps_service parsing) is
 * never mixed with agent data. This table only feeds the Analytics page.
 */
export const agentMetricsHistory = sqliteTable('agent_metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  tps_avg1m: real('tps_avg1m'),
  mspt_avg1m: real('mspt_avg1m'),
  player_count: integer('player_count').notNull().default(0),
  worlds_json: text('worlds_json').notNull().default('[]'),
  players_json: text('players_json').notNull().default('[]'),
  memory_json: text('memory_json').notNull().default('{}'),
  uptime_ms: integer('uptime_ms').notNull().default(0),
});

export type AgentMetricsHistoryRow = typeof agentMetricsHistory.$inferSelect;
