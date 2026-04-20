import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { auditLogs } from '@shulkr/backend/db/schema';

interface AuditEntry {
  userId: number | null;
  username: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

interface AuditQuery {
  userId?: number;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
}

class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        user_id: entry.userId,
        username: entry.username,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId ?? null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ip: entry.ip ?? null,
      });
    } catch {
      // Audit logging should never break the application
      console.error('[audit] Failed to write audit log:', entry.action);
    }
  }
  async query(params: AuditQuery) {
    const conditions = [];
    if (params.userId !== undefined) {
      conditions.push(eq(auditLogs.user_id, params.userId));
    }
    if (params.resourceType) {
      conditions.push(eq(auditLogs.resource_type, params.resourceType));
    }
    if (params.resourceId) {
      conditions.push(eq(auditLogs.resource_id, params.resourceId));
    }
    const limit = Math.min(params.limit ?? 100, 500);
    const offset = params.offset ?? 0;
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [logs, countResult] = await Promise.all([
      db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.created_at)).limit(limit).offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(where),
    ]);
    return {
      logs,
      total: countResult[0].count,
    };
  }
  async cleanup(daysToKeep = 90): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.delete(auditLogs).where(gte(auditLogs.created_at, cutoff));
    return result.changes;
  }
}

export const auditService = new AuditService();
