import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedUser } from '@shulkr/backend/test/seed';
import { notificationService } from '@shulkr/backend/services/notification_service';

describe('notification_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('create + list round-trip + getUnreadCount + markRead', async () => {
    const user = await seedUser(deps);

    await notificationService.create(user.id, {
      type: 'backup_success',
      title: 'Backup OK',
      message: 'Hello',
    });

    const list = await notificationService.list(user.id);
    expect(list.notifications.length).toBe(1);
    expect(list.notifications[0].title).toBe('Backup OK');
    expect(await notificationService.getUnreadCount(user.id)).toBe(1);

    await notificationService.markRead(list.notifications[0].id, user.id);
    expect(await notificationService.getUnreadCount(user.id)).toBe(0);
  });

  it('markAllRead clears unread for the user only', async () => {
    const userA = await seedUser(deps);
    const userB = await seedUser(deps);
    await notificationService.create(userA.id, { type: 'task_failure', title: 'A1', message: 'm' });
    await notificationService.create(userA.id, { type: 'task_failure', title: 'A2', message: 'm' });
    await notificationService.create(userB.id, { type: 'task_failure', title: 'B1', message: 'm' });

    await notificationService.markAllRead(userA.id);
    expect(await notificationService.getUnreadCount(userA.id)).toBe(0);
    expect(await notificationService.getUnreadCount(userB.id)).toBe(1);
  });
});
