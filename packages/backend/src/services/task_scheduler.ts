import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { scheduledTasks, taskExecutions, type ScheduledTask, type TaskConfig } from '@shulkr/backend/db/schema';
import { ServerService } from '@shulkr/backend/services/server_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

// Simple cron parser and scheduler
// Supports 5-field (minute hour day month weekday) and 6-field (second minute hour day month weekday)

interface CronJob {
  taskId: number;
  intervalId: NodeJS.Timeout;
}

class TaskScheduler {
  private jobs: Map<number, CronJob> = new Map();
  private serverService = new ServerService();
  private checkIntervalId: NodeJS.Timeout | null = null;
  private hasSecondsPrecision = false;
  private lastRunTimestamps: Map<number, number> = new Map();

  async initialize() {
    console.log('Initializing task scheduler...');

    // Load all enabled tasks and schedule them
    const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.enabled, true));

    for (const task of tasks) {
      await this.scheduleTask(task);
    }

    // Detect if any task uses 6-field cron (seconds precision)
    this.hasSecondsPrecision = tasks.some((task) => task.cron_expression.trim().split(/\s+/).length === 6);

    this.startScheduleCheck();

    console.log(`Task scheduler initialized with ${tasks.length} active tasks`);
  }

  updateCheckInterval() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    this.startScheduleCheck();
  }

  private startScheduleCheck() {
    const interval = this.hasSecondsPrecision ? 1000 : 60000;

    this.checkIntervalId = setInterval(async () => {
      await this.checkAndRunTasks();
    }, interval);

    // Also run immediately
    this.checkAndRunTasks();
  }

  private async checkAndRunTasks() {
    const now = new Date();
    const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.enabled, true));

    for (const task of tasks) {
      if (this.shouldRunNow(task.cron_expression, now)) {
        // Deduplicate: skip if already executed in the same second
        const nowSeconds = Math.floor(now.getTime() / 1000);
        const lastRun = this.lastRunTimestamps.get(task.id);

        if (lastRun === nowSeconds) continue;

        this.lastRunTimestamps.set(task.id, nowSeconds);
        console.log(`Running scheduled task: ${task.name} (${task.type})`);
        await this.executeTask(task);
      }
    }
  }

  private shouldRunNow(cronExpression: string, now: Date): boolean {
    const parts = cronExpression.trim().split(/\s+/);

    let secondStr: string;
    let minuteStr: string;
    let hourStr: string;
    let dayStr: string;
    let monthStr: string;
    let weekdayStr: string;

    if (parts.length === 6) {
      [secondStr, minuteStr, hourStr, dayStr, monthStr, weekdayStr] = parts;
    } else if (parts.length === 5) {
      secondStr = '0';
      [minuteStr, hourStr, dayStr, monthStr, weekdayStr] = parts;
    } else {
      return false;
    }

    return (
      this.matchCronPart(secondStr, now.getSeconds()) &&
      this.matchCronPart(minuteStr, now.getMinutes()) &&
      this.matchCronPart(hourStr, now.getHours()) &&
      this.matchCronPart(dayStr, now.getDate()) &&
      this.matchCronPart(monthStr, now.getMonth() + 1) &&
      this.matchCronPart(weekdayStr, now.getDay())
    );
  }

  private matchCronPart(pattern: string, value: number): boolean {
    if (pattern === '*') return true;

    // Handle */n (every n)
    if (pattern.startsWith('*/')) {
      const step = parseInt(pattern.slice(2));
      return value % step === 0;
    }

    // Handle comma-separated values
    if (pattern.includes(',')) {
      const values = pattern.split(',').map((v) => parseInt(v.trim()));
      return values.includes(value);
    }

    // Handle ranges (e.g., 1-5)
    if (pattern.includes('-')) {
      const [start, end] = pattern.split('-').map((v) => parseInt(v.trim()));
      return value >= start && value <= end;
    }

    // Simple number match
    return parseInt(pattern) === value;
  }

  private async executeTask(task: ScheduledTask) {
    const config = (task.config || {}) as TaskConfig;
    const startTime = Date.now();

    try {
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

      const durationMs = Date.now() - startTime;

      await Promise.all([
        db.insert(taskExecutions).values({
          task_id: task.id,
          status: 'success',
          duration_ms: durationMs,
        }),
        db
          .update(scheduledTasks)
          .set({
            last_run: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .where(eq(scheduledTasks.id, task.id)),
      ]);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`Failed to execute task ${task.name}:`, error);

      await db.insert(taskExecutions).values({
        task_id: task.id,
        status: 'error',
        duration_ms: durationMs,
        error: errorMessage,
      });
    }
  }

  private async executeRestartTask(serverId: string, config: TaskConfig) {
    const server = await this.serverService.getServerById(serverId);
    if (!server) return;

    // Send warning to players if configured
    if (config.warn_players && server.status === 'running') {
      const message = config.warn_message || 'Server restarting in 30 seconds...';
      const seconds = config.warn_seconds || 30;

      serverProcessManager.sendCommand(serverId, `say ${message}`);

      // Wait before restart
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }

    // Restart the server
    await this.serverService.restartServer(serverId);
  }

  private async executeBackupTask(serverId: string, config: TaskConfig) {
    const result = await this.serverService.backupServer(serverId, config.backup_paths, 'auto');
    if (result.success) {
      console.log(`Scheduled backup created: ${result.backup?.filename}`);
    } else {
      console.error(`Scheduled backup failed for server ${serverId}: ${result.error}`);
    }
  }

  private async executeCommandTask(serverId: string, config: TaskConfig) {
    if (!config.command) return;

    const server = await this.serverService.getServerById(serverId);
    if (!server || server.status !== 'running') return;

    serverProcessManager.sendCommand(serverId, config.command);
  }

  async scheduleTask(task: ScheduledTask) {
    console.log(`Scheduled task: ${task.name} (${task.cron_expression})`);
    await this.refreshCheckInterval();
  }

  async unscheduleTask(taskId: number) {
    const job = this.jobs.get(taskId);
    if (job) {
      clearInterval(job.intervalId);
      this.jobs.delete(taskId);
    }
    await this.refreshCheckInterval();
  }

  private async refreshCheckInterval() {
    const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.enabled, true));
    const needsSeconds = tasks.some((task) => task.cron_expression.trim().split(/\s+/).length === 6);

    if (needsSeconds !== this.hasSecondsPrecision) {
      this.hasSecondsPrecision = needsSeconds;
      this.updateCheckInterval();
    }
  }

  async shutdown() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    for (const job of this.jobs.values()) {
      clearInterval(job.intervalId);
    }
    this.jobs.clear();
    console.log('Task scheduler shut down');
  }
}

export const taskScheduler = new TaskScheduler();
