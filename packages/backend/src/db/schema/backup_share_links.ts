import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

// Local backups are plain files on disk with no backup_metadata row, so a share link references the backup by filename, not a foreign key.
export const backupShareLinks = sqliteTable('backup_share_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  server_id: text('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  token_preview: text('token_preview').notNull(),
  created_by: integer('created_by'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expires_at: text('expires_at').notNull(),
  revoked_at: text('revoked_at'),
  download_count: integer('download_count').notNull().default(0),
  last_downloaded_at: text('last_downloaded_at'),
  last_downloaded_ip: text('last_downloaded_ip'),
});

export type BackupShareLinkRow = typeof backupShareLinks.$inferSelect;
