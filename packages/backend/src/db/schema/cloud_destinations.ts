import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { generateId } from '@shulkr/backend/lib/id';

export type CloudProvider = 'aws-s3' | 'cloudflare-r2' | 'backblaze-b2' | 'wasabi' | 'minio-custom';

export const cloudDestinations = sqliteTable('cloud_destinations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text('name').notNull(),
  provider: text('provider').$type<CloudProvider>().notNull(),
  endpoint: text('endpoint').notNull(),
  region: text('region').notNull(),
  bucket: text('bucket').notNull(),
  access_key_id: text('access_key_id').notNull(),
  secret_access_key_encrypted: text('secret_access_key_encrypted').notNull(),
  prefix: text('prefix').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type CloudDestinationRow = typeof cloudDestinations.$inferSelect;
