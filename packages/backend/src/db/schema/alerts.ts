import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const alertRules = sqliteTable('alert_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  metric: text('metric').notNull(), // 'cpu' | 'ram' | 'disk' | 'tps'
  operator: text('operator').notNull(), // '>' | '<' | '>=' | '<='
  threshold: integer('threshold').notNull(),
  actions: text('actions').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const alertEvents = sqliteTable('alert_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  alert_rule_id: integer('alert_rule_id')
    .notNull()
    .references(() => alertRules.id, { onDelete: 'cascade' }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  metric: text('metric').notNull(),
  value: integer('value').notNull(),
  threshold: integer('threshold').notNull(),
  actions_taken: text('actions_taken').notNull().default('[]'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type AlertEvent = typeof alertEvents.$inferSelect;
