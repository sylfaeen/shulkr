import { eq, and, lt } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { webhooks, webhookDeliveries } from '@shulkr/backend/db/schema';
import { serverService } from '@shulkr/backend/services/server_service';
import { loadWebhookTemplates } from '@shulkr/backend/services/webhook_template_loader';
import type { WebhookLanguage } from '@shulkr/shared';

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 5_000;
const DELIVERY_RETENTION_DAYS = 30;

export type WebhookEvent =
  | 'server:start'
  | 'server:ready'
  | 'server:stop'
  | 'server:crash'
  | 'backup:success'
  | 'backup:failure'
  | 'player:join'
  | 'player:leave'
  | 'player:ban'
  | 'task:success'
  | 'task:failure'
  | 'alert:triggered';

interface WebhookEventData {
  serverName?: string;
  playerName?: string;
  backupFilename?: string;
  taskName?: string;
  alertName?: string;
  alertDetail?: string;
  error?: string;
  [key: string]: unknown;
}

const VARIABLE_MAP: Record<string, keyof WebhookEventData> = {
  server: 'serverName',
  player: 'playerName',
  filename: 'backupFilename',
  task: 'taskName',
  alert: 'alertName',
  detail: 'alertDetail',
  error: 'error',
};

function resolveTemplate(template: string, data: WebhookEventData): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_match, variable: string) => {
      const dataKey = VARIABLE_MAP[variable];
      if (!dataKey) return '';
      const value = data[dataKey];
      return typeof value === 'string' ? value : '';
    })
    .replace(/: $/g, '.')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function getTemplate(
  event: WebhookEvent,
  language: WebhookLanguage,
  customTemplates: Record<string, string> | null
): string {
  if (customTemplates?.[event]) {
    return customTemplates[event];
  }
  const defaults = loadWebhookTemplates(language);
  return defaults[event] ?? event;
}

function buildDiscordPayload(
  event: WebhookEvent,
  _serverId: string,
  serverName: string,
  data: WebhookEventData,
  language: WebhookLanguage,
  customTemplates: Record<string, string> | null
): object {
  const template = getTemplate(event, language, customTemplates);
  const content = resolveTemplate(template, { ...data, serverName });
  return { content };
}

function buildGenericPayload(event: WebhookEvent, serverId: string, serverName: string, data: WebhookEventData): object {
  return {
    event,
    serverId,
    serverName,
    timestamp: new Date().toISOString(),
    data,
  };
}

async function sendRequest(url: string, payload: object): Promise<{ statusCode: number; body: string; durationMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    return { statusCode: response.status, body, durationMs: Date.now() - start };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { statusCode: 0, body: message, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

function parseMessageTemplates(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

class WebhookService {
  async dispatch(serverId: string, event: WebhookEvent, data: WebhookEventData = {}): Promise<void> {
    const matchingWebhooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.server_id, serverId), eq(webhooks.enabled, true)));

    const server = await serverService.getServerById(serverId);
    const serverName = server?.name ?? serverId;

    const eligible = matchingWebhooks.filter((wh) => {
      const events: Array<string> = JSON.parse(wh.events);
      return events.includes(event);
    });

    await Promise.allSettled(
      eligible.map((wh) =>
        this.send(
          wh.id,
          wh.url,
          wh.format,
          event,
          serverId,
          serverName,
          data,
          (wh.language ?? 'en') as WebhookLanguage,
          parseMessageTemplates(wh.message_templates)
        )
      )
    );
  }

  async send(
    webhookId: number,
    url: string,
    format: string,
    event: WebhookEvent,
    serverId: string,
    serverName: string,
    data: WebhookEventData,
    language: WebhookLanguage,
    customTemplates: Record<string, string> | null
  ): Promise<void> {
    const payload =
      format === 'discord'
        ? buildDiscordPayload(event, serverId, serverName, data, language, customTemplates)
        : buildGenericPayload(event, serverId, serverName, data);

    let result = await sendRequest(url, payload);
    const isSuccess = result.statusCode >= 200 && result.statusCode < 300;

    // Retry once on failure
    if (!isSuccess) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      result = await sendRequest(url, payload);
    }

    const finalSuccess = result.statusCode >= 200 && result.statusCode < 300;

    await db.insert(webhookDeliveries).values({
      webhook_id: webhookId,
      event,
      status: finalSuccess ? 'success' : 'failure',
      status_code: result.statusCode || null,
      request_payload: JSON.stringify(payload),
      response_body: result.body.slice(0, 2000),
      duration_ms: result.durationMs,
    });
  }

  async sendTest(webhookId: number): Promise<{ success: boolean; statusCode: number }> {
    const [wh] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
    if (!wh) throw new Error('Webhook not found');

    const server = await serverService.getServerById(wh.server_id);
    const serverName = server?.name ?? wh.server_id;
    const language = (wh.language ?? 'en') as WebhookLanguage;
    const customTemplates = parseMessageTemplates(wh.message_templates);

    const payload =
      wh.format === 'discord'
        ? buildDiscordPayload('server:start', wh.server_id, serverName, { serverName }, language, customTemplates)
        : buildGenericPayload('server:start', wh.server_id, serverName, { serverName, test: true });

    const result = await sendRequest(wh.url, payload);
    const success = result.statusCode >= 200 && result.statusCode < 300;

    await db.insert(webhookDeliveries).values({
      webhook_id: webhookId,
      event: 'test',
      status: success ? 'success' : 'failure',
      status_code: result.statusCode || null,
      request_payload: JSON.stringify(payload),
      response_body: result.body.slice(0, 2000),
      duration_ms: result.durationMs,
    });

    return { success, statusCode: result.statusCode };
  }

  async cleanOldDeliveries(): Promise<void> {
    const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(webhookDeliveries).where(lt(webhookDeliveries.created_at, cutoff));
  }
}

export const webhookService = new WebhookService();
