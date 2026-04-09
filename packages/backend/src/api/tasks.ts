import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { scheduledTasks, taskExecutions, type ScheduledTask, type TaskExecution } from '@shulkr/backend/db/schema';
import { ServerService } from '@shulkr/backend/services/server_service';
import { taskScheduler } from '@shulkr/backend/services/task_scheduler';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from './middleware';

const s = initServer();
const serverService = new ServerService();
const ONE_MINUTE = 60_000;

function formatTask(task: ScheduledTask) {
  const config = task.config as { command?: string; backup_paths?: Array<string> } | null;
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
    type: task.type as 'restart' | 'backup' | 'command',
    command,
    schedule: task.cron_expression,
    enabled: task.enabled,
    lastRun: task.last_run,
    nextRun: task.next_run,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

function formatExecution(execution: TaskExecution) {
  const statusMap = {
    pending: 'pending' as const,
    running: 'running' as const,
    success: 'success' as const,
    error: 'failure' as const,
  };

  return {
    id: execution.id,
    taskId: execution.task_id,
    status: statusMap[execution.status] ?? ('failure' as const),
    output: execution.error ?? null,
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
      assertPermissions(user, 'server:tasks');

      const serverId = params.serverId;
      await getServerOrThrow(serverId);

      const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.server_id, serverId));
      return { status: 200 as const, body: { tasks: tasks.map(formatTask) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks');
      checkRateLimit(`user:${user.sub}:tasks.create`, 10, ONE_MINUTE);

      const serverId = params.serverId;
      await getServerOrThrow(serverId);

      const taskType = body.command === 'restart' ? 'restart' : body.command.startsWith('backup') ? 'backup' : 'command';
      const config =
        taskType === 'backup'
          ? { backup_paths: body.command.replace('backup ', '').split(' ').filter(Boolean) }
          : { command: body.command };

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
      assertPermissions(user, 'server:tasks');
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
      if (body.command !== undefined) {
        const newType = body.command === 'restart' ? 'restart' : body.command.startsWith('backup') ? 'backup' : 'command';
        updateData.type = newType;
        updateData.config =
          newType === 'backup'
            ? { backup_paths: body.command.replace('backup ', '').split(' ').filter(Boolean) }
            : { command: body.command };
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
      assertPermissions(user, 'server:tasks');
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
      assertPermissions(user, 'server:tasks');
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

  history: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:tasks');

      const serverId = params.serverId;
      const taskId = Number(params.taskId);

      const [task] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.server_id, serverId)))
        .limit(1);

      if (!task) {
        return { status: 200 as const, body: { executions: [] } };
      }

      const executions = await db
        .select()
        .from(taskExecutions)
        .where(eq(taskExecutions.task_id, taskId))
        .orderBy(desc(taskExecutions.created_at))
        .limit(100);

      return { status: 200 as const, body: { executions: executions.map(formatExecution) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
