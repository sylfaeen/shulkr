import { EventEmitter } from 'events';
import { eq, lt, and, count, desc } from 'drizzle-orm';
import { notifications, users } from '@shulkr/backend/db/schema';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type NotificationType = 'server_crash' | 'backup_success' | 'backup_failure' | 'alert_triggered' | 'task_failure';

export interface CreateNotificationData {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

type Deps = Pick<AppDeps, 'db' | 'clock'>;

export async function createNotification(
  deps: Deps,
  userId: number,
  data: CreateNotificationData
): Promise<{ created: typeof notifications.$inferSelect; unreadCount: number }> {
  const [created] = await deps.db
    .insert(notifications)
    .values({
      user_id: userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link ?? null,
    })
    .returning();

  const unreadCount = await getUnreadNotificationCount(deps, userId);

  return { created, unreadCount };
}

export async function broadcastNotification(deps: Deps, data: CreateNotificationData): Promise<void> {
  const allUsers = await deps.db.select({ id: users.id }).from(users);

  for (const user of allUsers) {
    await notificationService.create(user.id, data);
  }
}

export async function listNotifications(deps: Deps, userId: number, limit = 50, offset = 0) {
  const rows = await deps.db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(limit)
    .offset(offset);

  const [totalResult] = await deps.db.select({ value: count() }).from(notifications).where(eq(notifications.user_id, userId));

  return { notifications: rows, total: totalResult.value };
}

export async function getUnreadNotificationCount(deps: Deps, userId: number): Promise<number> {
  const [result] = await deps.db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)));

  return result.value;
}

export async function markNotificationRead(deps: Deps, notificationId: number, userId: number): Promise<void> {
  await deps.db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function markAllNotificationsRead(deps: Deps, userId: number): Promise<void> {
  await deps.db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)));
}

export async function cleanupNotifications(deps: Deps): Promise<number> {
  const cutoff = new Date(deps.clock().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await deps.db.delete(notifications).where(lt(notifications.created_at, cutoff));

  if (result.changes > 0) {
    console.log(`Notifications: cleaned up ${result.changes} entries older than ${RETENTION_DAYS} days`);
  }

  return result.changes;
}

class NotificationService extends EventEmitter {
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  initialize() {
    this.cleanup().catch(() => {});

    this.cleanupIntervalId = setInterval(() => {
      this.cleanup().catch(() => {});
    }, CLEANUP_INTERVAL_MS);

    this.cleanupIntervalId.unref();
  }

  async create(userId: number, data: CreateNotificationData): Promise<void> {
    const { created, unreadCount } = await createNotification(getAppDeps(), userId, data);
    this.emit('notification:new', { userId, notification: created, unreadCount });
  }

  async broadcast(data: CreateNotificationData): Promise<void> {
    await broadcastNotification(getAppDeps(), data);
  }

  async list(userId: number, limit = 50, offset = 0) {
    return listNotifications(getAppDeps(), userId, limit, offset);
  }

  async getUnreadCount(userId: number): Promise<number> {
    return getUnreadNotificationCount(getAppDeps(), userId);
  }

  async markRead(notificationId: number, userId: number): Promise<void> {
    return markNotificationRead(getAppDeps(), notificationId, userId);
  }

  async markAllRead(userId: number): Promise<void> {
    return markAllNotificationsRead(getAppDeps(), userId);
  }

  private async cleanup(): Promise<void> {
    await cleanupNotifications(getAppDeps());
  }

  shutdown() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

export const notificationService = new NotificationService();
