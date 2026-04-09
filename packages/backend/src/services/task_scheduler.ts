import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { scheduledTasks, type ScheduledTask } from '@shulkr/backend/db/schema';
import { jobQueueService } from '@shulkr/backend/services/job_queue_service';

// Simple cron parser and scheduler
// Supports 5-field (minute hour day month weekday) and 6-field (second minute hour day month weekday)
// Enqueues jobs into the job queue instead of executing them directly.

class TaskScheduler {
  private checkIntervalId: NodeJS.Timeout | null = null;
  private hasSecondsPrecision = false;
  private lastRunTimestamps: Map<number, number> = new Map();

  async initialize() {
    console.log('Initializing task scheduler...');

    const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.enabled, true));

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
      await this.checkAndEnqueueTasks();
    }, interval);

    this.checkAndEnqueueTasks();
  }

  private async checkAndEnqueueTasks() {
    const now = new Date();
    const tasks = await db.select().from(scheduledTasks).where(eq(scheduledTasks.enabled, true));

    for (const task of tasks) {
      if (this.shouldRunNow(task.cron_expression, now)) {
        const nowSeconds = Math.floor(now.getTime() / 1000);
        const lastRun = this.lastRunTimestamps.get(task.id);

        if (lastRun === nowSeconds) continue;

        this.lastRunTimestamps.set(task.id, nowSeconds);
        console.log(`Enqueuing scheduled task: ${task.name} (${task.type})`);
        await jobQueueService.enqueue(task);
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

    if (pattern.startsWith('*/')) {
      const step = parseInt(pattern.slice(2));
      return value % step === 0;
    }

    if (pattern.includes(',')) {
      const values = pattern.split(',').map((v) => parseInt(v.trim()));
      return values.includes(value);
    }

    if (pattern.includes('-')) {
      const [start, end] = pattern.split('-').map((v) => parseInt(v.trim()));
      return value >= start && value <= end;
    }

    return parseInt(pattern) === value;
  }

  async scheduleTask(task: ScheduledTask) {
    console.log(`Scheduled task: ${task.name} (${task.cron_expression})`);
    await this.refreshCheckInterval();
  }

  async unscheduleTask(_taskId: number) {
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
    console.log('Task scheduler shut down');
  }
}

export const taskScheduler = new TaskScheduler();
