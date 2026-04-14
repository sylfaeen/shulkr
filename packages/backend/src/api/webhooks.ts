import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes, type WebhookEvent } from '@shulkr/shared';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { webhooks, webhookDeliveries } from '@shulkr/backend/db/schema';
import { webhookService } from '@shulkr/backend/services/webhook_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const ONE_MINUTE = 60_000;

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const maskedPath = path.length > 10 ? path.slice(0, 10) + '***' : path;
    return `${parsed.origin}${maskedPath}`;
  } catch {
    return '***';
  }
}

function formatWebhook(wh: typeof webhooks.$inferSelect, reveal = false) {
  return {
    id: wh.id,
    serverId: wh.server_id,
    name: wh.name,
    url: reveal ? wh.url : maskUrl(wh.url),
    format: wh.format as 'discord' | 'generic',
    events: JSON.parse(wh.events) as Array<WebhookEvent>,
    enabled: wh.enabled,
    createdAt: wh.created_at,
    updatedAt: wh.updated_at,
  };
}

export const webhooksRoutes = s.router(contract.webhooks, {
  get: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:update');

      const webhookId = Number(params.webhookId);
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_NOT_FOUND, message: 'Webhook not found' } };
      }

      return { status: 200 as const, body: formatWebhook(existing, true) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  list: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:list');

      const result = await db.select().from(webhooks).where(eq(webhooks.server_id, params.serverId));
      return { status: 200 as const, body: result.map((wh) => formatWebhook(wh)) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:create');
      checkRateLimit(`user:${user.sub}:webhooks.create`, 10, ONE_MINUTE);

      const [created] = await db
        .insert(webhooks)
        .values({
          server_id: params.serverId,
          name: body.name,
          url: body.url,
          format: body.format,
          events: JSON.stringify(body.events),
        })
        .returning();

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create_webhook',
        resourceType: 'webhook',
        resourceId: String(created.id),
        details: { name: body.name, serverId: params.serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: formatWebhook(created) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:update');

      const webhookId = Number(params.webhookId);
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_NOT_FOUND, message: 'Webhook not found' } };
      }

      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updateData.name = body.name;
      if (body.url !== undefined) updateData.url = body.url;
      if (body.format !== undefined) updateData.format = body.format;
      if (body.events !== undefined) updateData.events = JSON.stringify(body.events);
      if (body.enabled !== undefined) updateData.enabled = body.enabled;

      const [updated] = await db.update(webhooks).set(updateData).where(eq(webhooks.id, webhookId)).returning();

      return { status: 200 as const, body: formatWebhook(updated) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:delete');

      const webhookId = Number(params.webhookId);
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_NOT_FOUND, message: 'Webhook not found' } };
      }

      await db.delete(webhooks).where(eq(webhooks.id, webhookId));

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete_webhook',
        resourceType: 'webhook',
        resourceId: String(webhookId),
        details: { name: existing.name, serverId: params.serverId },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Webhook deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  test: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:test');
      checkRateLimit(`user:${user.sub}:webhooks.test`, 10, ONE_MINUTE);

      const webhookId = Number(params.webhookId);
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_NOT_FOUND, message: 'Webhook not found' } };
      }

      const result = await webhookService.sendTest(webhookId);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  deliveries: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:list');

      const webhookId = Number(params.webhookId);
      const [existing] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.server_id, params.serverId)))
        .limit(1);

      if (!existing) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_NOT_FOUND, message: 'Webhook not found' } };
      }

      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;

      const [totalResult] = await db
        .select({ value: count() })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhook_id, webhookId));

      const rows = await db
        .select({
          id: webhookDeliveries.id,
          webhook_id: webhookDeliveries.webhook_id,
          event: webhookDeliveries.event,
          status: webhookDeliveries.status,
          status_code: webhookDeliveries.status_code,
          duration_ms: webhookDeliveries.duration_ms,
          created_at: webhookDeliveries.created_at,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhook_id, webhookId))
        .orderBy(desc(webhookDeliveries.created_at))
        .limit(limit)
        .offset(offset);

      return {
        status: 200 as const,
        body: {
          deliveries: rows.map((d) => ({
            id: d.id,
            webhookId: d.webhook_id,
            event: d.event,
            status: d.status as 'success' | 'failure',
            statusCode: d.status_code,
            durationMs: d.duration_ms,
            createdAt: d.created_at,
          })),
          total: totalResult.value,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  deliveryDetail: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:webhooks:list');

      const webhookId = Number(params.webhookId);
      const deliveryId = Number(params.deliveryId);

      const [delivery] = await db
        .select()
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhook_id, webhookId)))
        .limit(1);

      if (!delivery) {
        return { status: 404 as const, body: { code: ErrorCodes.WEBHOOK_DELIVERY_NOT_FOUND, message: 'Delivery not found' } };
      }

      return {
        status: 200 as const,
        body: {
          id: delivery.id,
          webhookId: delivery.webhook_id,
          event: delivery.event,
          status: delivery.status as 'success' | 'failure',
          statusCode: delivery.status_code,
          durationMs: delivery.duration_ms,
          requestPayload: delivery.request_payload,
          responseBody: delivery.response_body,
          createdAt: delivery.created_at,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
