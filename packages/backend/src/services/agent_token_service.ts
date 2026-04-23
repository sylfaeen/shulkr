import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AgentPlatform } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { serverAgents, type ServerAgentRow } from '@shulkr/backend/db/schema';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function verifyTokenAgainstHash(plain: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(plain), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function previewOf(token: string): string {
  return token.slice(0, 4);
}

export async function getServerAgent(serverId: string): Promise<ServerAgentRow | undefined> {
  const [row] = await db.select().from(serverAgents).where(eq(serverAgents.server_id, serverId)).limit(1);
  return row;
}

export async function enableAgent(
  serverId: string,
  platform?: AgentPlatform
): Promise<{ token: string; preview: string; createdAt: string }> {
  const token = generateToken();
  const token_hash = hashToken(token);
  const token_preview = previewOf(token);
  const now = new Date().toISOString();
  const existing = await getServerAgent(serverId);
  if (existing) {
    await db
      .update(serverAgents)
      .set({
        enabled: true,
        token_hash,
        token_preview,
        updated_at: now,
        ...(platform ? { platform } : {}),
      })
      .where(eq(serverAgents.server_id, serverId));
  } else {
    await db.insert(serverAgents).values({
      server_id: serverId,
      enabled: true,
      token_hash,
      token_preview,
      platform: platform ?? null,
      created_at: now,
      updated_at: now,
    });
  }
  return { token, preview: token_preview, createdAt: now };
}

export async function regenerateAgentToken(serverId: string): Promise<{ token: string; preview: string; createdAt: string }> {
  const existing = await getServerAgent(serverId);
  if (!existing) return enableAgent(serverId);
  const token = generateToken();
  const token_hash = hashToken(token);
  const token_preview = previewOf(token);
  const now = new Date().toISOString();
  await db.update(serverAgents).set({ token_hash, token_preview, updated_at: now }).where(eq(serverAgents.server_id, serverId));
  return { token, preview: token_preview, createdAt: now };
}

export async function disableAgent(serverId: string): Promise<boolean> {
  const existing = await getServerAgent(serverId);
  if (!existing) return false;
  await db
    .update(serverAgents)
    .set({ enabled: false, updated_at: new Date().toISOString() })
    .where(eq(serverAgents.server_id, serverId));
  return true;
}

export async function updateAgentHeartbeat(
  serverId: string,
  pluginVersion: string,
  platform: AgentPlatform,
  platformVersion: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(serverAgents)
    .set({
      plugin_version: pluginVersion,
      platform,
      platform_version: platformVersion,
      last_seen_at: now,
      updated_at: now,
    })
    .where(eq(serverAgents.server_id, serverId));
}

export function isConnected(row: ServerAgentRow | undefined): boolean {
  if (!row || !row.last_seen_at) return false;
  const last = Date.parse(row.last_seen_at);
  if (Number.isNaN(last)) return false;
  return Date.now() - last < 30_000;
}
