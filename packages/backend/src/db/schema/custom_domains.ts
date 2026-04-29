import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const customDomains = sqliteTable('custom_domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),
  port: integer('port').notNull(),
  type: text('type').$type<'http' | 'tcp' | 'connection' | 'panel'>().notNull().default('http'),
  ssl_enabled: integer('ssl_enabled', { mode: 'boolean' }).notNull().default(false),
  ssl_expires_at: text('ssl_expires_at'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type CustomDomain = typeof customDomains.$inferSelect;
export type NewCustomDomain = typeof customDomains.$inferInsert;
