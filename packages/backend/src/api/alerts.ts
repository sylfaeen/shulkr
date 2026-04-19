import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { alertRules, alertEvents } from '@shulkr/backend/db/schema';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const ONE_MINUTE = 60_000;

function formatRule(rule: typeof alertRules.$inferSelect) {
  return {
    id: rule.id,
    serverId: rule.server_id,
    name: rule.name,
    metric: rule.metric as 'cpu' | 'ram' | 'disk' | 'tps',
    operator: rule.operator as '>' | '<' | '>=' | '<=',
    threshold: rule.threshold,
    actions: JSON.parse(rule.actions) as Array<string>,
    enabled: rule.enabled,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  };
}

export const alertsRoutes = s.router(contract.alerts, {
  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:alerts:list');

      const rules = await db.select().from(alertRules).where(eq(alertRules.server_id, params.serverId));
      return { status: 200 as const, body: rules.map(formatRule) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:alerts:create');
      checkRateLimit(`user:${user.sub}:alerts.create`, 10, ONE_MINUTE);

      const [created] = await db
        .insert(alertRules)
        .values({
          server_id: params.serverId,
          name: body.name,
          metric: body.metric,
          operator: body.operator,
          threshold: body.threshold,
          actions: JSON.stringify(body.actions),
        })
        .returning();

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create_alert',
        resourceType: 'alert',
        resourceId: String(created.id),
        details: { name: body.name, serverId: params.serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: formatRule(created) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:alerts:update');

      const alertId = Number(params.alertId);
      const [existing] = await db
        .select()
        .from(alertRules)
        .where(and(eq(alertRules.id, alertId), eq(alertRules.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.ALERT_NOT_FOUND, message: 'Alert not found' } };
      }

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updateData.name = body.name;
      if (body.metric !== undefined) updateData.metric = body.metric;
      if (body.operator !== undefined) updateData.operator = body.operator;
      if (body.threshold !== undefined) updateData.threshold = body.threshold;
      if (body.actions !== undefined) updateData.actions = JSON.stringify(body.actions);
      if (body.enabled !== undefined) updateData.enabled = body.enabled;

      const [updated] = await db.update(alertRules).set(updateData).where(eq(alertRules.id, alertId)).returning();

      return { status: 200 as const, body: formatRule(updated) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:alerts:delete');

      const alertId = Number(params.alertId);
      const [existing] = await db
        .select()
        .from(alertRules)
        .where(and(eq(alertRules.id, alertId), eq(alertRules.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.ALERT_NOT_FOUND, message: 'Alert not found' } };
      }

      await db.delete(alertRules).where(eq(alertRules.id, alertId));

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete_alert',
        resourceType: 'alert',
        resourceId: String(alertId),
        details: { name: existing.name, serverId: params.serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Alert deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  events: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:alerts:list');

      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const [totalResult] = await db
        .select({ value: count() })
        .from(alertEvents)
        .where(eq(alertEvents.server_id, params.serverId));

      const rows = await db
        .select()
        .from(alertEvents)
        .where(eq(alertEvents.server_id, params.serverId))
        .orderBy(desc(alertEvents.created_at))
        .limit(limit)
        .offset(offset);

      return {
        status: 200 as const,
        body: {
          events: rows.map((e) => ({
            id: e.id,
            alertRuleId: e.alert_rule_id,
            serverId: e.server_id,
            metric: e.metric,
            value: e.value,
            threshold: e.threshold,
            actionsTaken: JSON.parse(e.actions_taken) as Array<string>,
            createdAt: e.created_at,
          })),
          total: totalResult.value,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
