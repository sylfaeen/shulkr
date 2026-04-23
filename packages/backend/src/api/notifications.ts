import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { notificationService } from '@shulkr/backend/services/notification_service';
import { authenticate, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

function formatNotification(n: {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}) {
  return {
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    read: n.read,
    createdAt: n.created_at,
  };
}

export const notificationsRoutes = s.router(contract.notifications, {
  list: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;
      const result = await notificationService.list(user.sub, limit, offset);
      return {
        status: 200 as const,
        body: {
          notifications: result.notifications.map(formatNotification),
          total: result.total,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  unreadCount: async ({ request }) => {
    try {
      const user = await authenticate(request);
      const count = await notificationService.getUnreadCount(user.sub);
      return { status: 200 as const, body: { count } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  markRead: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      await notificationService.markRead(Number(params.notificationId), user.sub);
      return { status: 200 as const, body: { message: 'Marked as read' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  markAllRead: async ({ request }) => {
    try {
      const user = await authenticate(request);
      await notificationService.markAllRead(user.sub);
      return { status: 200 as const, body: { message: 'All marked as read' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
