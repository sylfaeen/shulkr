import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { sftpAccountSchema, createSftpAccountSchema, updateSftpAccountSchema } from '../schemas/sftp';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const sftpContract = c.router({
  getInfo: {
    method: 'GET',
    path: '/api/sftp/info',
    responses: {
      200: z.object({
        host: z.string(),
        port: z.number(),
        shulkrUser: z.string().nullable(),
      }),
      401: errorSchema,
    },
  },
  list: {
    method: 'GET',
    path: '/api/sftp',
    query: z.object({
      serverId: z.string(),
    }),
    responses: {
      200: z.object({
        accounts: z.array(sftpAccountSchema),
      }),
      401: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/sftp',
    body: createSftpAccountSchema,
    responses: {
      201: sftpAccountSchema,
      401: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/sftp/:id',
    body: updateSftpAccountSchema,
    responses: {
      200: sftpAccountSchema,
      401: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/sftp/:id',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
    },
  },
});
