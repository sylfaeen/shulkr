import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const whitelistEntrySchema = z.object({
  uuid: z.string(),
  name: z.string(),
});

const playerSessionSchema = z.object({
  id: z.number(),
  playerName: z.string(),
  playerUuid: z.string().nullable(),
  ip: z.string().nullable(),
  joinedAt: z.string(),
  leftAt: z.string().nullable(),
  durationMs: z.number().nullable(),
});

export const playersContract = c.router({
  history: {
    method: 'GET',
    path: '/api/servers/:serverId/players/history',
    query: z.object({
      limit: z.coerce.number().min(1).max(200).optional(),
      offset: z.coerce.number().optional(),
    }),
    responses: {
      200: z.object({
        sessions: z.array(playerSessionSchema),
        total: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  whitelist: {
    method: 'GET',
    path: '/api/servers/:serverId/whitelist',
    responses: {
      200: z.object({
        entries: z.array(whitelistEntrySchema),
        enabled: z.boolean(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  whitelistAdd: {
    method: 'POST',
    path: '/api/servers/:serverId/whitelist',
    body: z.object({
      name: z.string().min(1),
    }),
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  whitelistRemove: {
    method: 'DELETE',
    path: '/api/servers/:serverId/whitelist/:playerName',
    body: null,
    responses: {
      200: z.object({ message: z.string() }),
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
});
