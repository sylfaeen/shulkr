import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const sftpAccounts = sqliteTable('sftp_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  password: text('password').notNull(),
  permissions: text('permissions').$type<'read-only' | 'read-write'>().notNull().default('read-write'),
  allowed_paths: text('allowed_paths').notNull().default('[]'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SftpAccount = typeof sftpAccounts.$inferSelect;
export type NewSftpAccount = typeof sftpAccounts.$inferInsert;
