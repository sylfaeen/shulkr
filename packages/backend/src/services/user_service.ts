import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { users, sessions } from '@shulkr/backend/db/schema';
import { ErrorCodes } from '@shulkr/shared';
import type { CreateUserRequest, UpdateUserRequest } from '@shulkr/shared';

const BCRYPT_ROUNDS = 12;

export class UserService {
  async getAllUsers() {
    const allUsers = await db.select().from(users);
    return allUsers.map((user) => ({
      id: user.id,
      username: user.username,
      permissions: JSON.parse(user.permissions),
      locale: user.locale ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    }));
  }

  async getUserById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      permissions: JSON.parse(user.permissions),
      locale: user.locale ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  async createUser(data: CreateUserRequest) {
    const [existing] = await db.select().from(users).where(eq(users.username, data.username)).limit(1);
    if (existing) {
      return { success: false as const, error: ErrorCodes.USER_ALREADY_EXISTS };
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const [newUser] = await db
      .insert(users)
      .values({
        username: data.username,
        password_hash: passwordHash,
        permissions: JSON.stringify(data.permissions),
      })
      .returning();

    return {
      success: true as const,
      user: {
        id: newUser.id,
        username: newUser.username,
        permissions: JSON.parse(newUser.permissions),
        locale: newUser.locale ?? null,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      },
    };
  }

  async updateUser(id: number, data: UpdateUserRequest) {
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) {
      return { success: false as const, error: ErrorCodes.USER_NOT_FOUND };
    }

    if (data.username) {
      const [conflict] = await db.select().from(users).where(eq(users.username, data.username)).limit(1);

      if (conflict && conflict.id !== id) {
        return { success: false as const, error: ErrorCodes.USER_ALREADY_EXISTS };
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.username) {
      updateData.username = data.username;
    }

    if (data.password) {
      updateData.password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      updateData.token_version = existing.token_version + 1;
    }

    if (data.permissions) {
      updateData.permissions = JSON.stringify(data.permissions);
    }

    if (data.locale !== undefined) {
      updateData.locale = data.locale;
    }

    const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    return {
      success: true as const,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        permissions: JSON.parse(updatedUser.permissions),
        locale: updatedUser.locale ?? null,
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at,
      },
    };
  }

  async deleteUser(id: number, currentUserId: number) {
    // Prevent self-deletion
    if (id === currentUserId) {
      return { success: false as const, error: ErrorCodes.USER_CANNOT_DELETE_SELF };
    }

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) {
      return { success: false as const, error: ErrorCodes.USER_NOT_FOUND };
    }

    await db.delete(sessions).where(eq(sessions.user_id, id));
    await db.delete(users).where(eq(users.id, id));

    return { success: true as const };
  }
}
