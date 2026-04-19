import { eq, lt } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import {
  scheduledTasks,
  taskExecutions,
  type ScheduledTask,
  type TaskConfig,
  type ChainStep,
  type TaskConditions,
  type ConditionRule,
} from '@shulkr/backend/db/schema';
import { serverService } from '@shulkr/backend/services/server_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { webhookService } from '@shulkr/backend/services/webhook_service';
import { notificationService } from '@shulkr/backend/services/notification_service';
import { playersService } from '@shulkr/backend/services/players_service';

const POLL_INTERVAL_MS = 1000;
const BASE_RETRY_DELAY_MS = 10_000;

const MAX_RETRIES_BY_TYPE: Record<string, number> = {
  restart: 1,
  backup: 2,
  command: 0,
};

type StepResult = { step: number; type: string; status: string; durationMs: number; error?: string };

type ChainFailure = Error & { stepResults: Array<StepResult> };

function isChainFailure(error: unknown): error is ChainFailure {
  return error instanceof Error && Array.isArray((error as ChainFailure).stepResults);
}

class JobQueueService {
  private pollIntervalId: NodeJS.Timeout | null = null;
  private serverService = serverService;
  private processing = false;
  async initialize() {
    await this.recoverFromCrash();
    await this.cleanupOldExecutions();
    this.startPolling();
    console.log('Job queue service initialized');
  }
  private async cleanupOldExecutions() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.delete(taskExecutions).where(lt(taskExecutions.created_at, cutoff));
    if (result.changes > 0) {
      console.log(`Job queue: cleaned up ${result.changes} executions older than 90 days`);
    }
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
      // Evaluate conditions before execution
      const config = (task.config || {}) as TaskConfig;
      if (config.conditions && !this.evaluateConditions(task.server_id, config.conditions)) {
        await db
          .update(taskExecutions)
          .set({ status: 'skipped', duration_ms: 0, error: 'Conditions not met' })
          .where(eq(taskExecutions.id, job.id));
        return;
      }
      const startTime = Date.now();
      try {
        const taskResult = await this.executeTask(task);
        const durationMs = Date.now() - startTime;
        const output = taskResult.stepResults ? JSON.stringify(taskResult.stepResults) : null;
        await Promise.all([
          db
            .update(taskExecutions)
            .set({ status: 'success', duration_ms: durationMs, output })
            .where(eq(taskExecutions.id, job.id)),
          db
            .update(scheduledTasks)
            .set({
              last_run: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .where(eq(scheduledTasks.id, task.id)),
        ]);
        webhookService
          .dispatch(task.server_id, task.type === 'backup' ? 'backup:success' : 'task:success', { taskName: task.name })
          .catch(() => {});
      } catch (error: unknown) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const chainOutput = isChainFailure(error) ? JSON.stringify(error.stepResults) : null;
        console.error(`Job queue: task "${task.name}" failed (attempt ${job.retry_count + 1}):`, errorMessage);
        webhookService
          .dispatch(task.server_id, task.type === 'backup' ? 'backup:failure' : 'task:failure', {
            taskName: task.name,
            error: errorMessage,
          })
          .catch(() => {});
        notificationService
          .broadcast({
            type: task.type === 'backup' ? 'backup_failure' : 'task_failure',
            title: task.type === 'backup' ? 'Backup failed' : `Task "${task.name}" failed`,
            message: errorMessage,
            link: `/app/servers/${task.server_id}/tasks`,
          })
          .catch(() => {});
        if (job.retry_count < job.max_retries) {
          // Schedule retry with exponential backoff
          const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, job.retry_count);
          await db
            .update(taskExecutions)
            .set({
              status: 'error',
              duration_ms: durationMs,
              error: errorMessage,
              output: chainOutput,
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
              output: chainOutput,
            })
            .where(eq(taskExecutions.id, job.id));
        }
      }
    } finally {
      this.processing = false;
    }
  }
  private async executeTask(task: ScheduledTask): Promise<{ stepResults?: Array<StepResult> }> {
    const config = (task.config || {}) as TaskConfig;
    switch (task.type) {
      case 'restart':
        await this.executeRestartTask(task.server_id, config);
        return {};
      case 'backup':
        await this.executeBackupTask(task.server_id, config);
        return {};
      case 'command':
        await this.executeCommandTask(task.server_id, config);
        return {};
      case 'chain':
        return { stepResults: await this.executeChainTask(task.server_id, config) };
    }
    return {};
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
  private async executeChainTask(serverId: string, config: TaskConfig): Promise<Array<StepResult>> {
    const steps = config.steps;
    if (!steps || steps.length === 0) throw new Error('No steps configured');
    const stepResults: Array<StepResult> = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStart = Date.now();
      try {
        await this.executeChainStep(serverId, step);
        stepResults.push({ step: i, type: step.type, status: 'success', durationMs: Date.now() - stepStart });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stepResults.push({ step: i, type: step.type, status: 'error', durationMs: Date.now() - stepStart, error: errorMessage });
        if (step.onError === 'stop') {
          const chainError = new Error(`Step ${i + 1} (${step.type}) failed: ${errorMessage}`) as ChainFailure;
          chainError.stepResults = stepResults;
          throw chainError;
        }
      }
    }
    return stepResults;
  }
  private async executeChainStep(serverId: string, step: ChainStep) {
    switch (step.type) {
      case 'restart': {
        const config: TaskConfig = {
          warn_players: step.config.warnPlayers as boolean | undefined,
          warn_message: step.config.warnMessage as string | undefined,
          warn_seconds: step.config.warnSeconds as number | undefined,
        };
        await this.executeRestartTask(serverId, config);
        break;
      }
      case 'backup': {
        const config: TaskConfig = { backup_paths: step.config.paths as Array<string> | undefined };
        await this.executeBackupTask(serverId, config);
        break;
      }
      case 'command': {
        const command = step.config.command as string;
        if (!command) throw new Error('No command in step');
        await this.executeCommandTask(serverId, { command });
        break;
      }
      case 'delay': {
        const seconds = (step.config.seconds as number) || 10;
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        break;
      }
      case 'webhook': {
        const url = step.config.url as string;
        if (!url) throw new Error('No webhook URL in step');
        const payload = { event: 'chain:step', serverId, step: step.config };
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        break;
      }
    }
  }
  private evaluateConditions(serverId: string, conditions: TaskConditions): boolean {
    const results = conditions.rules.map((rule) => this.evaluateRule(serverId, rule));
    return conditions.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
  }
  private evaluateRule(serverId: string, rule: ConditionRule): boolean {
    switch (rule.type) {
      case 'server_status': {
        const expected = rule.config.status as string;
        const actual = serverProcessManager.getStatus(serverId).status;
        return expected === 'online' ? actual === 'running' : actual === 'stopped';
      }
      case 'player_count': {
        const operator = rule.config.operator as string;
        const value = rule.config.value as number;
        const count = playersService.getPlayerCount(serverId);
        switch (operator) {
          case '>':
            return count > value;
          case '<':
            return count < value;
          case '>=':
            return count >= value;
          case '<=':
            return count <= value;
          case '=':
            return count === value;
          default:
            return false;
        }
      }
      case 'time_range': {
        const from = rule.config.from as string; // "03:00"
        const to = rule.config.to as string; // "06:00"
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [fromH, fromM] = from.split(':').map(Number);
        const [toH, toM] = to.split(':').map(Number);
        const fromMinutes = fromH * 60 + fromM;
        const toMinutes = toH * 60 + toM;
        if (fromMinutes <= toMinutes) {
          return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
        }
        // Overnight range (e.g. 22:00 → 06:00)
        return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
      }
      default:
        return true;
    }
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
