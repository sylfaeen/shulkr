import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const userTotp = sqliteTable('user_totp', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  encrypted_secret: text('encrypted_secret').notNull(),
  verified: integer('verified').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type UserTotpRecord = typeof userTotp.$inferSelect;
export type NewUserTotpRecord = typeof userTotp.$inferInsert;
