import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export type AgentPlatformName = 'paper' | 'folia' | 'velocity' | 'waterfall';

export const serverAgents = sqliteTable('server_agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .unique()
    .references(() => servers.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  token_hash: text('token_hash').notNull(),
  token_preview: text('token_preview').notNull(),
  platform: text('platform').$type<AgentPlatformName>(),
  platform_version: text('platform_version'),
  plugin_version: text('plugin_version'),
  last_seen_at: text('last_seen_at'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type ServerAgentRow = typeof serverAgents.$inferSelect;
