import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { eq, and, desc, count } from 'drizzle-orm';
import { db, sqlite } from '@shulkr/backend/db';
import {
  scheduledTasks,
  taskExecutions,
  type ScheduledTask,
  type TaskConfig,
  type TaskExecution,
} from '@shulkr/backend/db/schema';
import { serverService } from '@shulkr/backend/services/server_service';
import { taskScheduler } from '@shulkr/backend/services/task_scheduler';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const ONE_MINUTE = 60_000;

function formatTask(task: ScheduledTask) {
  const config = task.config as TaskConfig | null;
  const command =
    task.type === 'restart'
      ? 'restart'
      : task.type === 'backup'
        ? config?.backup_paths
          ? `backup ${config.backup_paths.join(' ')}`
          : 'backup'
        : (config?.command ?? '');

  return {
    id: task.id,
    serverId: task.server_id,
    name: task.name,
    type: task.type as 'restart' | 'backup' | 'command' | 'chain',
    command,
    schedule: task.cron_expression,
    enabled: task.enabled,
    warnPlayers: config?.warn_players ?? null,
    warnMessage: config?.warn_message ?? null,
    warnSeconds: config?.warn_seconds ?? null,
    steps: config?.steps ?? null,
    conditions: config?.conditions ?? null,
    lastRun: task.last_run,
    nextRun: task.next_run,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

function formatExecution(execution: TaskExecution) {
  const statusMap: Record<string, 'pending' | 'running' | 'success' | 'error' | 'skipped'> = {
    pending: 'pending',
    running: 'running',
    success: 'success',
    error: 'error',
    skipped: 'skipped',
  };

  let stepResults = null;
  if (execution.output) {
    try {
      const parsed = JSON.parse(execution.output);
      if (Array.isArray(parsed)) stepResults = parsed;
    } catch {}
  }

  return {
    id: execution.id,
    taskId: execution.task_id,
    status: statusMap[execution.status] ?? 'error',
    output: execution.error ?? null,
    stepResults,
    executedAt: execution.created_at,
    startedAt: execution.started_at ?? null,
    duration: execution.duration_ms,
    retryCount: execution.retry_count,
    maxRetries: execution.max_retries,
  };
}

async function getServerOrThrow(serverId: string) {
  const server = await serverService.getServerById(serverId);
  if (!server) throw { status: 200, body: { message: 'Server not found' } };
  return server;
}

export const tasksRoutes = s.router(contract.tasks, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:list');

      const serverId = params.serverId;
      await getServerOrThrow(serverId);

      const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.server_id, serverId));
      return { status: 200 as const, body: { tasks: tasks.map(formatTask), serverTime: new Date().toISOString() } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:create');
      checkRateLimit(`user:${user.sub}:tasks.create`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      await getServerOrThrow(serverId);

      const taskType = body.steps
        ? ('chain' as const)
        : body.command === 'restart'
          ? ('restart' as const)
          : body.command.startsWith('backup')
            ? ('backup' as const)
            : ('command' as const);

      const baseConfig: TaskConfig = body.steps
        ? { steps: body.steps }
        : taskType === 'restart'
          ? {
              command: body.command,
              warn_players: body.warnPlayers,
              warn_message: body.warnMessage,
              warn_seconds: body.warnSeconds,
            }
          : taskType === 'backup'
            ? { backup_paths: body.command.replace('backup ', '').split(' ').filter(Boolean) }
            : { command: body.command };

      const config: TaskConfig = body.conditions ? { ...baseConfig, conditions: body.conditions } : baseConfig;

      const [newTask] = await db
        .insert(scheduledTasks)
        .values({
          server_id: serverId,
          name: body.name,
          type: taskType,
          cron_expression: body.schedule,
          enabled: true,
          config,
        })
        .returning();

      if (newTask.enabled) {
        await taskScheduler.scheduleTask(newTask);
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'task',
        resourceId: String(newTask.id),
        details: { name: body.name, serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: formatTask(newTask) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:update');
      checkRateLimit(`user:${user.sub}:tasks.update`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      const taskId = Number(params.taskId);

      const [existingTask] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.server_id, serverId)))
        .limit(1);

      if (!existingTask) {
        return { status: 429 as const, body: { code: ErrorCodes.TASK_NOT_FOUND, message: ErrorCodes.TASK_NOT_FOUND } };
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) updateData.name = body.name;
      if (body.schedule !== undefined) updateData.cron_expression = body.schedule;
      if (body.enabled !== undefined) updateData.enabled = body.enabled;

      const existingConfig = (existingTask.config || {}) as TaskConfig;
      const isChainUpdate = body.steps !== undefined;

      if (isChainUpdate) {
        updateData.type = 'chain';
        const baseConfig: TaskConfig = { steps: body.steps };
        updateData.config =
          body.conditions !== undefined
            ? body.conditions === null
              ? baseConfig
              : { ...baseConfig, conditions: body.conditions }
            : existingConfig.conditions
              ? { ...baseConfig, conditions: existingConfig.conditions }
              : baseConfig;
      } else if (body.command !== undefined) {
        const newType = body.command === 'restart' ? 'restart' : body.command.startsWith('backup') ? 'backup' : 'command';
        updateData.type = newType;
        const baseConfig: TaskConfig =
          newType === 'restart'
            ? {
                command: body.command,
                warn_players: body.warnPlayers,
                warn_message: body.warnMessage,
                warn_seconds: body.warnSeconds,
              }
            : newType === 'backup'
              ? { backup_paths: body.command.replace('backup ', '').split(' ').filter(Boolean) }
              : { command: body.command };
        updateData.config =
          body.conditions !== undefined
            ? body.conditions === null
              ? baseConfig
              : { ...baseConfig, conditions: body.conditions }
            : existingConfig.conditions
              ? { ...baseConfig, conditions: existingConfig.conditions }
              : baseConfig;
      } else {
        const hasWarnChanges =
          body.warnPlayers !== undefined || body.warnMessage !== undefined || body.warnSeconds !== undefined;
        const hasConditionsChange = body.conditions !== undefined;
        if (hasWarnChanges || hasConditionsChange) {
          const nextConfig: TaskConfig = { ...existingConfig };
          if (body.warnPlayers !== undefined) nextConfig.warn_players = body.warnPlayers;
          if (body.warnMessage !== undefined) nextConfig.warn_message = body.warnMessage;
          if (body.warnSeconds !== undefined) nextConfig.warn_seconds = body.warnSeconds;
          if (hasConditionsChange) {
            if (body.conditions === null) delete nextConfig.conditions;
            else nextConfig.conditions = body.conditions;
          }
          updateData.config = nextConfig;
        }
      }

      const [updatedTask] = await db.update(scheduledTasks).set(updateData).where(eq(scheduledTasks.id, taskId)).returning();

      await taskScheduler.unscheduleTask(taskId);
      if (updatedTask.enabled) {
        await taskScheduler.scheduleTask(updatedTask);
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'update',
        resourceType: 'task',
        resourceId: String(taskId),
        ip: request.ip,
      });

      return { status: 200 as const, body: formatTask(updatedTask) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:delete');
      checkRateLimit(`user:${user.sub}:tasks.delete`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      const taskId = Number(params.taskId);

      const [existingTask] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.server_id, serverId)))
        .limit(1);

      if (!existingTask) {
        return { status: 200 as const, body: { message: 'Task not found' } };
      }

      await taskScheduler.unscheduleTask(taskId);
      await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId));

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'task',
        resourceId: String(taskId),
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Task deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  toggle: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:toggle');
      checkRateLimit(`user:${user.sub}:tasks.toggle`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      const taskId = Number(params.taskId);

      const [existingTask] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.server_id, serverId)))
        .limit(1);

      if (!existingTask) {
        return { status: 429 as const, body: { code: ErrorCodes.TASK_NOT_FOUND, message: ErrorCodes.TASK_NOT_FOUND } };
      }

      const newEnabled = !existingTask.enabled;

      const [updatedTask] = await db
        .update(scheduledTasks)
        .set({
          enabled: newEnabled,
          updated_at: new Date().toISOString(),
        })
        .where(eq(scheduledTasks.id, taskId))
        .returning();

      await taskScheduler.unscheduleTask(taskId);
      if (newEnabled) {
        await taskScheduler.scheduleTask(updatedTask);
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'toggle',
        resourceType: 'task',
        resourceId: String(taskId),
        details: { enabled: newEnabled },
        ip: request.ip,
      });

      return { status: 200 as const, body: formatTask(updatedTask) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  history: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:list');

      const serverId = params.serverId;
      const taskId = Number(params.taskId);

      const [task] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.server_id, serverId)))
        .limit(1);

      if (!task) {
        return { status: 200 as const, body: { executions: [], total: 0 } };
      }

      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const [totalResult] = await db.select({ value: count() }).from(taskExecutions).where(eq(taskExecutions.task_id, taskId));

      const executions = await db
        .select()
        .from(taskExecutions)
        .where(eq(taskExecutions.task_id, taskId))
        .orderBy(desc(taskExecutions.created_at))
        .limit(limit)
        .offset(offset);

      return { status: 200 as const, body: { executions: executions.map(formatExecution), total: totalResult.value } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  stats: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks:list');

      const taskId = Number(params.taskId);

      const rows = sqlite
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
             SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
             AVG(CASE WHEN status = 'success' THEN duration_ms ELSE NULL END) AS avg_duration,
             MAX(created_at) AS last_execution
           FROM task_executions
           WHERE task_id = ?`
        )
        .get(taskId) as {
        total: number;
        success: number;
        error: number;
        skipped: number;
        avg_duration: number | null;
        last_execution: string | null;
      };

      return {
        status: 200 as const,
        body: {
          total: rows.total,
          success: rows.success,
          error: rows.error,
          skipped: rows.skipped,
          avgDurationMs: rows.avg_duration !== null ? Math.round(rows.avg_duration) : 0,
          lastExecution: rows.last_execution,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
