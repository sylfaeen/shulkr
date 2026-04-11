import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const recoveryCodes = sqliteTable('recovery_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code_hash: text('code_hash').notNull(),
  used_at: text('used_at'),
});

export type RecoveryCodeRecord = typeof recoveryCodes.$inferSelect;
export type NewRecoveryCodeRecord = typeof recoveryCodes.$inferInsert;
