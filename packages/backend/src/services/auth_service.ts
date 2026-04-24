import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { users, sessions } from '@shulkr/backend/db/schema';
import type { FastifyInstance } from 'fastify';

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const TOTP_TOKEN_EXPIRES_SECONDS = 300; // 5 minutes

interface TokenPayload {
  sub: number;
  username: string;
  permissions: Array<string>;
  token_version: number;
}

interface TotpTokenPayload {
  sub: number;
  purpose: 'totp_verification';
}

export interface AuthResult {
  access_token: string;
  user: {
    id: number;
    username: string;
    permissions: Array<string>;
    locale: string | null;
  };
}

export class AuthService {
  constructor(private fastify: FastifyInstance) {}
  async validateCredentials(username: string, password: string): Promise<{ valid: boolean; user?: typeof users.$inferSelect }> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) {
      return { valid: false };
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    return { valid, user: valid ? user : undefined };
  }
  generateAccessToken(user: typeof users.$inferSelect): string {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      permissions: JSON.parse(user.permissions),
      token_version: user.token_version,
    };
    return this.fastify.jwt.sign(payload);
  }
  generateTotpToken(userId: number): string {
    const payload: TotpTokenPayload = {
      sub: userId,
      purpose: 'totp_verification',
    };
    return this.fastify.jwt.sign(payload, { expiresIn: TOTP_TOKEN_EXPIRES_SECONDS });
  }
  verifyTotpToken(token: string): { valid: boolean; userId?: number } {
    try {
      const decoded = this.fastify.jwt.verify<TotpTokenPayload>(token);
      if (decoded.purpose !== 'totp_verification') {
        return { valid: false };
      }
      return { valid: true, userId: decoded.sub };
    } catch {
      return { valid: false };
    }
  }
  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }
  async createSession(userId: number, refreshToken: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
    await db.insert(sessions).values({
      user_id: userId,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
    });
  }
  async validateRefreshToken(refreshToken: string): Promise<{ valid: boolean; user?: typeof users.$inferSelect }> {
    const [session] = await db.select().from(sessions).where(eq(sessions.refresh_token, refreshToken)).limit(1);
    if (!session) {
      return { valid: false };
    }
    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await this.invalidateSession(refreshToken);
      return { valid: false };
    }
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, session.user_id)).limit(1);
    if (!user) {
      return { valid: false };
    }
    return { valid: true, user };
  }
  async invalidateSession(refreshToken: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.refresh_token, refreshToken));
  }
  async invalidateAllUserSessions(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.user_id, userId));
  }
  async login(
    username: string,
    password: string
  ): Promise<{ success: true; data: AuthResult; refreshToken: string } | { success: false }> {
    const { valid, user } = await this.validateCredentials(username, password);
    if (!valid || !user) {
      return { success: false };
    }
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken();
    await this.createSession(user.id, refreshToken);
    return {
      success: true,
      data: {
        access_token: accessToken,
        user: {
          id: user.id,
          username: user.username,
          permissions: JSON.parse(user.permissions),
          locale: user.locale ?? null,
        },
      },
      refreshToken,
    };
  }
  async refresh(
    refreshToken: string
  ): Promise<{ success: true; data: AuthResult; newRefreshToken: string } | { success: false }> {
    const { valid, user } = await this.validateRefreshToken(refreshToken);
    if (!valid || !user) {
      return { success: false };
    }
    // Invalidate old refresh token
    await this.invalidateSession(refreshToken);
    // Generate new tokens
    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken();
    await this.createSession(user.id, newRefreshToken);
    return {
      success: true,
      data: {
        access_token: accessToken,
        user: {
          id: user.id,
          username: user.username,
          permissions: JSON.parse(user.permissions),
          locale: user.locale ?? null,
        },
      },
      newRefreshToken,
    };
  }
}
