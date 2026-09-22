import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users, sessions } from '@shulkr/backend/db/schema';
import { ErrorCodes } from '@shulkr/shared';
import type { CreateUserRequest, UpdateUserRequest } from '@shulkr/shared';
import { type AppDeps } from '@shulkr/backend/deps';

const BCRYPT_ROUNDS = 12;

type Deps = Pick<AppDeps, 'db' | 'clock'>;

function serializeUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    permissions: JSON.parse(row.permissions) as Array<string>,
    locale: row.locale ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAllUsers(deps: Deps) {
  const allUsers = await deps.db.select().from(users);

  return allUsers.map(serializeUser);
}

export async function getUserById(deps: Deps, id: number) {
  const [user] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  return serializeUser(user);
}

export async function getUserWithHash(deps: Deps, id: number) {
  const [user] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);

  return user ?? null;
}

export async function createUser(deps: Deps, data: CreateUserRequest) {
  const [existing] = await deps.db.select().from(users).where(eq(users.username, data.username)).limit(1);

  if (existing) {
    return { success: false as const, error: ErrorCodes.USER_ALREADY_EXISTS };
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const [newUser] = await deps.db
    .insert(users)
    .values({
      username: data.username,
      password_hash: passwordHash,
      permissions: JSON.stringify(data.permissions),
    })
    .returning();

  return { success: true as const, user: serializeUser(newUser) };
}

export async function updateUser(deps: Deps, id: number, data: UpdateUserRequest) {
  const [existing] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!existing) {
    return { success: false as const, error: ErrorCodes.USER_NOT_FOUND };
  }

  if (data.username) {
    const [conflict] = await deps.db.select().from(users).where(eq(users.username, data.username)).limit(1);

    if (conflict && conflict.id !== id) {
      return { success: false as const, error: ErrorCodes.USER_ALREADY_EXISTS };
    }
  }

  const updateData: Record<string, unknown> = {
    updated_at: deps.clock().toISOString(),
  };

  if (data.username) updateData.username = data.username;

  if (data.password) {
    updateData.password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    updateData.token_version = existing.token_version + 1;
  }

  if (data.permissions) updateData.permissions = JSON.stringify(data.permissions);
  if (data.locale !== undefined) updateData.locale = data.locale;

  const [updatedUser] = await deps.db.update(users).set(updateData).where(eq(users.id, id)).returning();

  return { success: true as const, user: serializeUser(updatedUser) };
}

export async function deleteUser(deps: Deps, id: number, currentUserId: number) {
  if (id === currentUserId) {
    return { success: false as const, error: ErrorCodes.USER_CANNOT_DELETE_SELF };
  }

  const [existing] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!existing) {
    return { success: false as const, error: ErrorCodes.USER_NOT_FOUND };
  }

  await deps.db.delete(sessions).where(eq(sessions.user_id, id));
  await deps.db.delete(users).where(eq(users.id, id));

  return { success: true as const };
}
