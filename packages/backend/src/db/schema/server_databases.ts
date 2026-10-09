import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const serverDatabases = sqliteTable(
  'server_databases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    server_id: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    db_name: text('db_name').notNull().unique(),
    db_user: text('db_user').notNull().unique(),
    password_encrypted: text('password_encrypted').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverSlugUnique: uniqueIndex('idx_server_databases_server_slug').on(table.server_id, table.slug),
    serverIdx: index('idx_server_databases_server').on(table.server_id),
  })
);

export type ServerDatabaseRow = typeof serverDatabases.$inferSelect;
export type NewServerDatabase = typeof serverDatabases.$inferInsert;
