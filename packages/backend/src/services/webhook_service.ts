import { eq, and, lt } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { webhooks, webhookDeliveries } from '@shulkr/backend/db/schema';
import { ServerService } from '@shulkr/backend/services/server_service';

const serverService = new ServerService();

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 5_000;
const DELIVERY_RETENTION_DAYS = 30;

export type WebhookEvent =
  | 'server:start'
  | 'server:stop'
  | 'server:crash'
  | 'backup:success'
  | 'backup:failure'
  | 'player:join'
  | 'player:leave'
  | 'player:ban'
  | 'task:success'
  | 'task:failure';

interface WebhookEventData {
  serverName?: string;
  playerName?: string;
  backupFilename?: string;
  taskName?: string;
  error?: string;
  [key: string]: unknown;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

const EVENT_COLORS: Record<string, number> = {
  'server:start': 0x22c55e, // green
  'server:stop': 0xf59e0b, // amber
  'server:crash': 0xef4444, // red
  'backup:success': 0x22c55e,
  'backup:failure': 0xef4444,
  'player:join': 0x3b82f6, // blue
  'player:leave': 0x6b7280, // gray
  'player:ban': 0xef4444,
  'task:success': 0x22c55e,
  'task:failure': 0xef4444,
};

const EVENT_TITLES: Record<string, string> = {
  'server:start': 'Server Started',
  'server:stop': 'Server Stopped',
  'server:crash': 'Server Crashed',
  'backup:success': 'Backup Completed',
  'backup:failure': 'Backup Failed',
  'player:join': 'Player Joined',
  'player:leave': 'Player Left',
  'player:ban': 'Player Banned',
  'task:success': 'Task Completed',
  'task:failure': 'Task Failed',
};

function buildDiscordPayload(event: WebhookEvent, serverId: string, serverName: string, data: WebhookEventData): object {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [{ name: 'Server', value: serverName, inline: true }];

  if (data.playerName) fields.push({ name: 'Player', value: data.playerName, inline: true });
  if (data.backupFilename) fields.push({ name: 'Backup', value: data.backupFilename, inline: true });
  if (data.taskName) fields.push({ name: 'Task', value: data.taskName, inline: true });
  if (data.error) fields.push({ name: 'Error', value: data.error, inline: false });

  const embed: DiscordEmbed = {
    title: EVENT_TITLES[event] ?? event,
    color: EVENT_COLORS[event] ?? 0x6b7280,
    timestamp: new Date().toISOString(),
    fields,
  };

  return { embeds: [embed] };
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

    await Promise.allSettled(eligible.map((wh) => this.send(wh.id, wh.url, wh.format, event, serverId, serverName, data)));
  }

  async send(
    webhookId: number,
    url: string,
    format: string,
    event: WebhookEvent,
    serverId: string,
    serverName: string,
    data: WebhookEventData
  ): Promise<void> {
    const payload =
      format === 'discord'
        ? buildDiscordPayload(event, serverId, serverName, data)
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

    const payload =
      wh.format === 'discord'
        ? buildDiscordPayload('server:start', wh.server_id, serverName, { serverName })
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
