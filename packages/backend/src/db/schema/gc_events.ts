import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { servers } from '@shulkr/backend/db/schema/servers';

export const gcEvents = sqliteTable('gc_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server_id: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  gc_type: text('gc_type').notNull(), // 'G1 Young', 'G1 Old', 'ZGC', 'Shenandoah', 'unknown'
  duration_ms: real('duration_ms').notNull(),
  heap_before_mb: integer('heap_before_mb'),
  heap_after_mb: integer('heap_after_mb'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type GcEvent = typeof gcEvents.$inferSelect;
