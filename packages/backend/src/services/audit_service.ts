import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { auditLogs, alertEvents, alertRules } from '@shulkr/backend/db/schema';
import { type AppDeps } from '@shulkr/backend/deps';

export interface AuditEntry {
  userId: number | null;
  username: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditQuery {
  userId?: number;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
}

type Deps = Pick<AppDeps, 'db' | 'clock'>;

export async function logAuditAction(deps: Deps, entry: AuditEntry): Promise<void> {
  try {
    await deps.db.insert(auditLogs).values({
      user_id: entry.userId,
      username: entry.username,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ip: entry.ip ?? null,
    });
  } catch {
    console.error('[audit] Failed to write audit log:', entry.action);
  }
}

export async function queryAuditLogs(deps: Deps, params: AuditQuery) {
  const conditions = [];
  if (params.userId !== undefined) conditions.push(eq(auditLogs.user_id, params.userId));
  if (params.resourceType) conditions.push(eq(auditLogs.resource_type, params.resourceType));
  if (params.resourceId) conditions.push(eq(auditLogs.resource_id, params.resourceId));

  const limit = Math.min(params.limit ?? 100, 500);
  const offset = params.offset ?? 0;
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    deps.db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.created_at)).limit(limit).offset(offset),
    deps.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(where),
  ]);

  return { logs, total: countResult[0].count };
}

export async function getServerActivity(deps: Deps, serverId: string, hours: number, limit: number) {
  const sinceDate = new Date(deps.clock().getTime() - hours * 3600_000);
  const since = sinceDate.toISOString().replace('T', ' ').slice(0, 19);

  const [auditRows, alertRows] = await Promise.all([
    deps.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.resource_id, serverId), gte(auditLogs.created_at, since)))
      .orderBy(desc(auditLogs.created_at))
      .limit(limit),
    deps.db
      .select({
        id: alertEvents.id,
        metric: alertEvents.metric,
        value: alertEvents.value,
        threshold: alertEvents.threshold,
        createdAt: alertEvents.created_at,
        ruleName: alertRules.name,
      })
      .from(alertEvents)
      .leftJoin(alertRules, eq(alertEvents.alert_rule_id, alertRules.id))
      .where(and(eq(alertEvents.server_id, serverId), gte(alertEvents.created_at, since)))
      .orderBy(desc(alertEvents.created_at))
      .limit(limit),
  ]);

  return { auditRows, alertRows };
}

export async function cleanupAuditLogs(deps: Deps, daysToKeep = 90): Promise<number> {
  const cutoff = new Date(deps.clock().getTime() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
  const result = await deps.db.delete(auditLogs).where(gte(auditLogs.created_at, cutoff));

  return result.changes;
}
