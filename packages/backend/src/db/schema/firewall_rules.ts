import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const firewallRules = sqliteTable('firewall_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').$type<'allow' | 'deny'>().notNull().default('allow'),
  port: text('port'),
  protocol: text('protocol').$type<'tcp' | 'udp' | 'both'>().notNull(),
  from_ip: text('from_ip'),
  label: text('label').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type FirewallRule = typeof firewallRules.$inferSelect;
export type NewFirewallRule = typeof firewallRules.$inferInsert;
