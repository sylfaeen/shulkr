import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';
import { cloudDestinations } from '@shulkr/backend/db/schema/cloud_destinations';

export type BackupLocation = 'local' | 'cloud' | 'hybrid';

export const backupMetadata = sqliteTable('backup_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull().unique(),
  size: integer('size').notNull().default(0),
  location: text('location').$type<BackupLocation>().notNull().default('local'),
  local_path: text('local_path'),
  cloud_destination_id: text('cloud_destination_id').references(() => cloudDestinations.id, {
    onDelete: 'set null',
  }),
  cloud_key: text('cloud_key'),
  cloud_checksum: text('cloud_checksum'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  cloud_uploaded_at: text('cloud_uploaded_at'),
});

export type BackupMetadataRow = typeof backupMetadata.$inferSelect;
