import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { scheduledTasks, taskExecutions, type ScheduledTask, type TaskConfig } from '@shulkr/backend/db/schema';
import { ServerService } from '@shulkr/backend/services/server_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

const POLL_INTERVAL_MS = 1000;
const BASE_RETRY_DELAY_MS = 10_000;

const MAX_RETRIES_BY_TYPE: Record<string, number> = {
  restart: 1,
  backup: 2,
  command: 0,
};

class JobQueueService {
  private pollIntervalId: NodeJS.Timeout | null = null;
  private serverService = new ServerService();
  private processing = false;

  async initialize() {
    await this.recoverFromCrash();
    this.startPolling();
    console.log('Job queue service initialized');
  }

  // On startup, mark any "running" jobs as "error": they were interrupted by a crash.
  private async recoverFromCrash() {
    const staleJobs = await db.select().from(taskExecutions).where(eq(taskExecutions.status, 'running'));

    for (const job of staleJobs) {
      await db
        .update(taskExecutions)
        .set({
          status: 'error',
          error: 'Process crashed during execution',
          duration_ms: 0,
        })
        .where(eq(taskExecutions.id, job.id));

      console.warn(`Job queue: recovered stale running job #${job.id} (task_id=${job.task_id})`);
    }

    if (staleJobs.length > 0) {
      console.log(`Job queue: recovered ${staleJobs.length} stale job(s) from previous crash`);
    }
  }

  private startPolling() {
    this.pollIntervalId = setInterval(async () => {
      await this.processNextJob();
    }, POLL_INTERVAL_MS);
  }

  // Enqueue a new job for a scheduled task.
  async enqueue(task: ScheduledTask): Promise<void> {
    const maxRetries = MAX_RETRIES_BY_TYPE[task.type] ?? 0;

    await db.insert(taskExecutions).values({
      task_id: task.id,
      status: 'pending',
      duration_ms: 0,
      max_retries: maxRetries,
    });
  }

  // Pick the oldest pending job and execute it.
  private async processNextJob() {
    if (this.processing) return;

    const [job] = await db
      .select()
      .from(taskExecutions)
      .where(eq(taskExecutions.status, 'pending'))
      .orderBy(taskExecutions.created_at)
      .limit(1);

    if (!job) return;

    this.processing = true;

    try {
      // Mark as running
      const startedAt = new Date().toISOString();
      await db.update(taskExecutions).set({ status: 'running', started_at: startedAt }).where(eq(taskExecutions.id, job.id));

      // Load the parent task for config
      const [task] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, job.task_id)).limit(1);

      if (!task) {
        await db
          .update(taskExecutions)
          .set({ status: 'error', error: 'Parent task not found' })
          .where(eq(taskExecutions.id, job.id));
        return;
      }

      const startTime = Date.now();

      try {
        await this.executeTask(task);
        const durationMs = Date.now() - startTime;

        await Promise.all([
          db.update(taskExecutions).set({ status: 'success', duration_ms: durationMs }).where(eq(taskExecutions.id, job.id)),
          db
            .update(scheduledTasks)
            .set({
              last_run: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .where(eq(scheduledTasks.id, task.id)),
        ]);
      } catch (error: unknown) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error(`Job queue: task "${task.name}" failed (attempt ${job.retry_count + 1}):`, errorMessage);

        if (job.retry_count < job.max_retries) {
          // Schedule retry with exponential backoff
          const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, job.retry_count);

          await db
            .update(taskExecutions)
            .set({
              status: 'error',
              duration_ms: durationMs,
              error: errorMessage,
            })
            .where(eq(taskExecutions.id, job.id));

          // Enqueue a retry job after delay
          setTimeout(async () => {
            try {
              await db.insert(taskExecutions).values({
                task_id: task.id,
                status: 'pending',
                duration_ms: 0,
                retry_count: job.retry_count + 1,
                max_retries: job.max_retries,
              });
              console.log(
                `Job queue: retry ${job.retry_count + 1}/${job.max_retries} for task "${task.name}" in ${retryDelay}ms`
              );
            } catch (retryError: unknown) {
              console.error('Job queue: failed to enqueue retry:', retryError);
            }
          }, retryDelay);
        } else {
          await db
            .update(taskExecutions)
            .set({
              status: 'error',
              duration_ms: durationMs,
              error: job.max_retries > 0 ? `${errorMessage} (after ${job.retry_count + 1} attempts)` : errorMessage,
            })
            .where(eq(taskExecutions.id, job.id));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeTask(task: ScheduledTask) {
    const config = (task.config || {}) as TaskConfig;

    switch (task.type) {
      case 'restart':
        await this.executeRestartTask(task.server_id, config);
        break;
      case 'backup':
        await this.executeBackupTask(task.server_id, config);
        break;
      case 'command':
        await this.executeCommandTask(task.server_id, config);
        break;
    }
  }

  private async executeRestartTask(serverId: string, config: TaskConfig) {
    const server = await this.serverService.getServerById(serverId);
    if (!server) throw new Error('Server not found');

    if (config.warn_players && server.status === 'running') {
      const message = config.warn_message || 'Server restarting in 30 seconds...';
      const seconds = config.warn_seconds || 30;

      serverProcessManager.sendCommand(serverId, `say ${message}`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }

    const result = await this.serverService.restartServer(serverId);
    if (!result.success) throw new Error(result.error ?? 'Restart failed');
  }

  private async executeBackupTask(serverId: string, config: TaskConfig) {
    const result = await this.serverService.backupServer(serverId, config.backup_paths, 'auto');
    if (!result.success) throw new Error(result.error ?? 'Backup failed');
    console.log(`Job queue: backup created: ${result.backup?.filename}`);
  }

  private async executeCommandTask(serverId: string, config: TaskConfig) {
    if (!config.command) throw new Error('No command configured');

    const server = await this.serverService.getServerById(serverId);
    if (!server || server.status !== 'running') throw new Error('Server not running');

    const sent = serverProcessManager.sendCommand(serverId, config.command);
    if (!sent) throw new Error('Failed to send command');
  }

  async shutdown() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    console.log('Job queue service shut down');
  }
}

export const jobQueueService = new JobQueueService();
