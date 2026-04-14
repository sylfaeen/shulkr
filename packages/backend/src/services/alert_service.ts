import { eq, and, lt } from 'drizzle-orm';
import { statfs } from 'fs/promises';
import { db } from '@shulkr/backend/db';
import { alertRules, alertEvents } from '@shulkr/backend/db/schema';
import { webhookService } from '@shulkr/backend/services/webhook_service';
import { notificationService } from '@shulkr/backend/services/notification_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { ServerService } from '@shulkr/backend/services/server_service';

const serverService = new ServerService();
const EVENT_RETENTION_DAYS = 90;

export type AlertMetric = 'cpu' | 'ram' | 'disk' | 'tps';
export type AlertOperator = '>' | '<' | '>=' | '<=';

interface MetricsSnapshot {
  cpu: number;
  memoryPercent: number;
  tps?: number;
}

function checkThreshold(value: number, operator: AlertOperator, threshold: number): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
  }
}

async function getDiskUsagePercent(serverPath: string): Promise<number> {
  try {
    const stats = await statfs(serverPath);
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;
    const used = total - free;
    return Math.round((used / total) * 100);
  } catch {
    return -1;
  }
}

class AlertService {
  async evaluate(serverId: string, metrics: MetricsSnapshot): Promise<void> {
    const rules = await db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.server_id, serverId), eq(alertRules.enabled, true)));

    if (rules.length === 0) return;

    const server = await serverService.getServerById(serverId);
    if (!server) return;

    let diskPercent: number | null = null;

    for (const rule of rules) {
      const metric = rule.metric as AlertMetric;
      const operator = rule.operator as AlertOperator;
      let value: number;

      switch (metric) {
        case 'cpu':
          value = Math.round(metrics.cpu);
          break;
        case 'ram':
          value = Math.round(metrics.memoryPercent);
          break;
        case 'disk':
          if (diskPercent === null) diskPercent = await getDiskUsagePercent(server.path);
          if (diskPercent < 0) continue;
          value = diskPercent;
          break;
        case 'tps':
          if (metrics.tps === undefined) continue;
          value = Math.round(metrics.tps * 10) / 10;
          break;
        default:
          continue;
      }

      if (!checkThreshold(value, operator, rule.threshold)) continue;

      const actions: Array<string> = JSON.parse(rule.actions);
      const actionsTaken: Array<string> = [];

      for (const action of actions) {
        try {
          if (action === 'notify') {
            await notificationService.broadcast({
              type: 'alert_triggered',
              title: `Alert: ${rule.name}`,
              message: `${metric.toUpperCase()} is ${value}% (threshold: ${operator} ${rule.threshold}%)`,
              link: `/app/servers/${serverId}/alerts`,
            });
            actionsTaken.push('notify');
          } else if (action.startsWith('webhook:')) {
            await webhookService.dispatch(serverId, 'server:crash', {
              serverName: server.name,
              error: `Alert: ${rule.name} — ${metric} is ${value} (threshold: ${operator} ${rule.threshold})`,
            });
            actionsTaken.push(action);
          } else if (action === 'restart') {
            await serverProcessManager.stop(serverId);
            setTimeout(() => serverProcessManager.start(server), 5000);
            actionsTaken.push('restart');
          } else if (action === 'backup') {
            serverService.backupServer(serverId, undefined, 'auto').catch(() => {});
            actionsTaken.push('backup');
          } else if (action.startsWith('command:')) {
            const command = action.slice('command:'.length);
            serverProcessManager.sendCommand(serverId, command);
            actionsTaken.push(action);
          }
        } catch {
          actionsTaken.push(`${action}:failed`);
        }
      }

      await db.insert(alertEvents).values({
        alert_rule_id: rule.id,
        server_id: serverId,
        metric,
        value: Math.round(value),
        threshold: rule.threshold,
        actions_taken: JSON.stringify(actionsTaken),
      });
    }
  }

  async cleanOldEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(alertEvents).where(lt(alertEvents.created_at, cutoff));
  }
}

export const alertService = new AlertService();
