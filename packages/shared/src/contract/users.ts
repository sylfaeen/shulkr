import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { userResponseSchema, createUserSchema, updateUserSchema } from '../schemas/user';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const usersContract = c.router({
  list: {
    method: 'GET',
    path: '/api/users',
    responses: {
      200: z.array(userResponseSchema),
      401: errorSchema,
      403: errorSchema,
    },
  },
  byId: {
    method: 'GET',
    path: '/api/users/:id',
    responses: {
      200: userResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/users',
    body: createUserSchema,
    responses: {
      201: userResponseSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      429: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/users/:id',
    body: updateUserSchema,
    responses: {
      200: userResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      409: errorSchema,
      429: errorSchema,
    },
  },
  updateLocale: {
    method: 'PATCH',
    path: '/api/users/locale',
    body: z.object({
      locale: z.string().nullable(),
    }),
    responses: {
      200: userResponseSchema,
      401: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/users/:id',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      429: errorSchema,
    },
  },
});
