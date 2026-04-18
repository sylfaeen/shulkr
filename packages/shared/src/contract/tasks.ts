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

const conditionRuleSchema = z.object({
  type: z.enum(['server_status', 'player_count', 'time_range']),
  config: z.record(z.unknown()),
});

const taskConditionsSchema = z.object({
  logic: z.enum(['and', 'or']),
  rules: z.array(conditionRuleSchema).min(1),
});

const chainStepSchema = z.object({
  type: z.enum(['backup', 'restart', 'command', 'delay', 'webhook']),
  config: z.record(z.unknown()),
  onError: z.enum(['stop', 'continue']),
});

const taskSchema = z.object({
  id: z.number(),
  serverId: z.string(),
  name: z.string(),
  type: z.enum(['restart', 'backup', 'command', 'chain']),
  command: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  warnPlayers: z.boolean().nullable(),
  warnMessage: z.string().nullable(),
  warnSeconds: z.number().nullable(),
  steps: z.array(chainStepSchema).nullable(),
  conditions: taskConditionsSchema.nullable(),
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
  warnPlayers: z.boolean().optional(),
  warnMessage: z.string().optional(),
  warnSeconds: z.coerce.number().min(5).max(300).optional(),
  steps: z.array(chainStepSchema).optional(),
  conditions: taskConditionsSchema.optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  command: z.string().optional(),
  schedule: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  warnPlayers: z.boolean().optional(),
  warnMessage: z.string().optional(),
  warnSeconds: z.coerce.number().min(5).max(300).optional(),
  steps: z.array(chainStepSchema).optional(),
  conditions: taskConditionsSchema.nullable().optional(),
});

const executionSchema = z.object({
  id: z.number(),
  taskId: z.number(),
  status: z.enum(['pending', 'running', 'success', 'error', 'skipped']),
  output: z.string().nullable(),
  stepResults: z
    .array(
      z.object({
        step: z.number(),
        type: z.string(),
        status: z.string(),
        durationMs: z.number(),
        error: z.string().optional(),
      })
    )
    .nullable(),
  executedAt: z.string(),
  startedAt: z.string().nullable(),
  duration: z.number(),
  retryCount: z.number(),
  maxRetries: z.number(),
});

export const tasksContract = c.router({
  list: {
    method: 'GET',
    path: '/api/servers/:serverId/tasks',
    responses: {
      200: z.object({
        tasks: z.array(taskSchema),
        serverTime: z.string(),
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
    query: z.object({
      limit: z.coerce.number().min(1).max(200).optional(),
      offset: z.coerce.number().min(0).optional(),
    }),
    responses: {
      200: z.object({
        executions: z.array(executionSchema),
        total: z.number(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  stats: {
    method: 'GET',
    path: '/api/servers/:serverId/tasks/:taskId/stats',
    responses: {
      200: z.object({
        total: z.number(),
        success: z.number(),
        error: z.number(),
        skipped: z.number(),
        avgDurationMs: z.number(),
        lastExecution: z.string().nullable(),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
});
