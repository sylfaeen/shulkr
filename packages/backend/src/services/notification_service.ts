import { EventEmitter } from 'events';
import { eq, lt, and, count } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { notifications, users } from '@shulkr/backend/db/schema';
import { desc } from 'drizzle-orm';

const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type NotificationType = 'server_crash' | 'backup_success' | 'backup_failure' | 'alert_triggered' | 'task_failure';

interface CreateNotificationData {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

class NotificationService extends EventEmitter {
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  initialize() {
    this.cleanup().catch(() => {});
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup().catch(() => {});
    }, CLEANUP_INTERVAL_MS);
  }

  async create(userId: number, data: CreateNotificationData): Promise<void> {
    const [created] = await db
      .insert(notifications)
      .values({
        user_id: userId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link ?? null,
      })
      .returning();

    const unreadCount = await this.getUnreadCount(userId);
    this.emit('notification:new', { userId, notification: created, unreadCount });
  }

  async broadcast(data: CreateNotificationData): Promise<void> {
    const allUsers = await db.select({ id: users.id }).from(users);

    for (const user of allUsers) {
      await this.create(user.id, data);
    }
  }

  async list(userId: number, limit = 50, offset = 0) {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db.select({ value: count() }).from(notifications).where(eq(notifications.user_id, userId));

    return { notifications: rows, total: totalResult.value };
  }

  async getUnreadCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)));

    return result.value;
  }

  async markRead(notificationId: number, userId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
  }

  async markAllRead(userId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)));
  }

  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.delete(notifications).where(lt(notifications.created_at, cutoff));
    if (result.changes > 0) {
      console.log(`Notifications: cleaned up ${result.changes} entries older than ${RETENTION_DAYS} days`);
    }
  }

  shutdown() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

export const notificationService = new NotificationService();
