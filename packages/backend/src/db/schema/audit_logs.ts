import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id'),
  username: text('username'),
  action: text('action').notNull(),
  resource_type: text('resource_type').notNull(),
  resource_id: text('resource_id'),
  details: text('details'),
  ip: text('ip'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type AuditLogRecord = typeof auditLogs.$inferSelect;
export type NewAuditLogRecord = typeof auditLogs.$inferInsert;
