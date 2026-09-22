import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const profileSchema = z.object({
  name: z.string(),
  uuid: z.string().nullable(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  totalPlaytimeMinutes: z.number(),
  sessionCount: z.number(),
  avatarUrl: z.string().nullable(),
  online: z.boolean(),
});

const sessionSchema = z.object({
  id: z.number(),
  joinedAt: z.string(),
  leftAt: z.string().nullable(),
  durationMinutes: z.number().nullable(),
});

const moderationSchema = z.object({
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banDate: z.string().nullable(),
  banSource: z.string().nullable(),
  banExpires: z.string().nullable(),
});

const searchResultSchema = z.object({
  name: z.string(),
  uuid: z.string().nullable(),
  lastSeen: z.string(),
});

export const playerProfileContract = c.router({
  profile: {
    method: 'GET',
    path: '/api/servers/:serverId/players/:playerName/profile',
    responses: {
      200: profileSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  sessions: {
    method: 'GET',
    path: '/api/servers/:serverId/players/:playerName/sessions',
    query: z.object({
      limit: z.coerce.number().min(1).max(1000).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({ sessions: z.array(sessionSchema), total: z.number() }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  moderation: {
    method: 'GET',
    path: '/api/servers/:serverId/players/:playerName/moderation',
    responses: {
      200: moderationSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  search: {
    method: 'GET',
    path: '/api/servers/:serverId/players/search',
    query: z.object({ q: z.string().min(1) }),
    responses: {
      200: z.array(searchResultSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
