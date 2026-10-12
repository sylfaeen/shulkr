import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const notificationSchema = z.object({
  id: z.number(),
  userId: z.number(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});

export const notificationsContract = c.router({
  list: {
    method: 'GET',
    path: '/api/notifications',
    query: z.object({
      limit: z.coerce.number().min(1).max(100).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({ notifications: z.array(notificationSchema), total: z.number() }),
      401: errorSchema,
    },
  },
  unreadCount: {
    method: 'GET',
    path: '/api/notifications/unread-count',
    responses: {
      200: z.object({ count: z.number() }),
      401: errorSchema,
    },
  },
  markRead: {
    method: 'PATCH',
    path: '/api/notifications/:notificationId/read',
    body: null,
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
    },
  },
  markAllRead: {
    method: 'POST',
    path: '/api/notifications/read-all',
    body: null,
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
    },
  },
});
