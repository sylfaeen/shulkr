import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { serverDatabases } from '@shulkr/backend/db/schema/server_databases';

export type DatabaseAccessScope = 'read' | 'write';

export const databaseAccesses = sqliteTable(
  'database_accesses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    database_id: integer('database_id')
      .notNull()
      .references(() => serverDatabases.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    username: text('username').notNull().unique(),
    password_encrypted: text('password_encrypted').notNull(),
    scope: text('scope').$type<DatabaseAccessScope>().notNull(),
    allowed_ip: text('allowed_ip').notNull(),
    require_certificate: integer('require_certificate', { mode: 'boolean' }).notNull().default(false),
    last_used_at: text('last_used_at'),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // A double submit would otherwise create two MariaDB users granting the same thing to the same machine, and revoking one would leave the other behind.
    databaseIpScopeUnique: uniqueIndex('idx_database_accesses_db_ip_scope').on(table.database_id, table.allowed_ip, table.scope),
    databaseIdx: index('idx_database_accesses_database').on(table.database_id),
  })
);

export type DatabaseAccessRow = typeof databaseAccesses.$inferSelect;
export type NewDatabaseAccess = typeof databaseAccesses.$inferInsert;
