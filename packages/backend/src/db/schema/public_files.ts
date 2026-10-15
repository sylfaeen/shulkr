import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from '@shulkr/backend/db/schema/users';

// storage_key is the on-disk name, a UUID drawn at finalization and unrelated to the token, so neither the public URL nor the original name ever reaches a filesystem path.
export const publicFiles = sqliteTable('public_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storage_key: text('storage_key').notNull().unique(),
  original_name: text('original_name').notNull(),
  mime_type: text('mime_type').notNull(),
  disposition: text('disposition', { enum: ['inline', 'attachment'] }).notNull(),
  size_bytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  // Minecraft checks a server resource pack against resource-pack-sha1, so the panel shows this digest next to the link.
  sha1: text('sha1').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  token_encrypted: text('token_encrypted').notNull(),
  created_by: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expires_at: text('expires_at'),
  max_downloads: integer('max_downloads'),
  download_count: integer('download_count').notNull().default(0),
  last_downloaded_at: text('last_downloaded_at'),
  last_downloaded_ip: text('last_downloaded_ip'),
});

export type PublicFileRow = typeof publicFiles.$inferSelect;

export const publicFileUploads = sqliteTable('public_file_uploads', {
  id: text('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  original_name: text('original_name').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  received_bytes: integer('received_bytes').notNull().default(0),
  expires_in_hours: integer('expires_in_hours'),
  max_downloads: integer('max_downloads'),
  // Set when the upload replaces the content of an existing share: the finished file takes over that row and keeps its token, so the URL never changes.
  replaces_file_id: integer('replaces_file_id').references(() => publicFiles.id, { onDelete: 'cascade' }),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export type PublicFileUploadRow = typeof publicFileUploads.$inferSelect;
