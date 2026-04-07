import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

const taskSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  name: z.string(),
  type: z.enum(['restart', 'backup', 'command']),
  command: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  lastRun: z.string().nullable(),
  nextRun: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createTaskSchema = z.object({
  serverId: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  command: z.string().min(1, 'Command is required'),
  schedule: z.string().min(1, 'Schedule is required'),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  command: z.string().optional(),
  schedule: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const executionSchema = z.object({
  id: z.number(),
  taskId: z.number(),
  status: z.enum(['success', 'failure', 'skipped']),
  output: z.string().nullable(),
  executedAt: z.string(),
  duration: z.number(),
});

export const tasksContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/tasks',
    responses: {
      200: z.object({
        tasks: z.array(taskSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/servers/:serverId/tasks',
    body: createTaskSchema,
    responses: {
      200: taskSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  update: {
    method: 'PATCH',
    path: '/api/servers/:serverId/tasks/:taskId',
    body: updateTaskSchema,
    responses: {
      200: taskSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  delete: {
    method: 'DELETE',
    path: '/api/servers/:serverId/tasks/:taskId',
    body: null,
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  toggle: {
    method: 'POST',
    path: '/api/servers/:serverId/tasks/:taskId/toggle',
    body: null,
    responses: {
      200: taskSchema,
      401: errorSchema,
      403: errorSchema,
      429: errorSchema,
    },
  },
  history: {
    method: 'GET',
    path: '/api/servers/:serverId/tasks/:taskId/history',
    responses: {
      200: z.object({
        executions: z.array(executionSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
