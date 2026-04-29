import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { eq, desc } from 'drizzle-orm';
import { globalIpBans } from '@shulkr/backend/db/schema';
import { ErrorCodes } from '@shulkr/shared';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { type AppDeps } from '@shulkr/backend/deps';

const SCRIPT_PATH = process.env.FIREWALL_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_firewall.sh');

interface ScriptResult {
  success: boolean;
  error?: string;
}

interface AddBanInput {
  ip: string;
  reason?: string | null;
  bannedBy: string;
  playerName?: string | null;
  requestSourceIp?: string | null;
}

type Deps = Pick<AppDeps, 'db' | 'shell'>;

async function runScript(deps: Deps, args: Array<string>): Promise<ScriptResult> {
  const result = await deps.shell.run('sudo', [SCRIPT_PATH, ...args], { timeoutMs: 15000 });
  if (!result.success) {
    let errorMessage = `Firewall script failed: ${result.stderr || result.stdout || 'unknown error'}`;
    try {
      const parsed = JSON.parse(result.stderr || result.stdout) as { error?: string };
      if (parsed.error) errorMessage = parsed.error;
    } catch {}
    return { success: false, error: errorMessage };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { success?: boolean };
    return { success: parsed.success !== false };
  } catch {
    return { success: true };
  }
}

// Lowercases, trims, and decodes IPv4-mapped IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`) so a ban posted in either form lands in DB as the canonical IPv4. Without this, traffic arriving at a dual-stack kernel as `::ffff:X.Y.Z.W` would bypass a ban posted on `X.Y.Z.W`. Exported for unit testing.
export function normalizeIp(ip: string): string {
  const lowered = ip.trim().toLowerCase();
  if (lowered.startsWith('::ffff:')) {
    const suffix = lowered.slice(7);
    if (isIP(suffix) === 4) return suffix;
  }
  return lowered;
}

export async function listGlobalIpBans(deps: Deps) {
  return deps.db.select().from(globalIpBans).orderBy(desc(globalIpBans.created_at));
}

export async function addGlobalIpBan(deps: Deps, input: AddBanInput) {
  const ip = normalizeIp(input.ip);

  if (isIP(ip) === 0) throw new Error(ErrorCodes.GLOBAL_IP_BAN_INVALID_IP);

  if (input.requestSourceIp && normalizeIp(input.requestSourceIp) === ip) {
    throw new Error(ErrorCodes.GLOBAL_IP_BAN_CANNOT_BAN_SELF);
  }

  const [existing] = await deps.db.select().from(globalIpBans).where(eq(globalIpBans.ip, ip)).limit(1);
  if (existing) throw new Error(ErrorCodes.GLOBAL_IP_BAN_ALREADY_EXISTS);

  const result = await runScript(deps, ['block-ip', ip]);
  if (!result.success) throw new Error(ErrorCodes.GLOBAL_IP_BAN_SCRIPT_FAILED);

  const [ban] = await deps.db
    .insert(globalIpBans)
    .values({
      ip,
      reason: input.reason ?? null,
      banned_by: input.bannedBy,
      player_name: input.playerName ?? null,
    })
    .returning();
  return ban;
}

export async function removeGlobalIpBan(deps: Deps, banId: number) {
  const [ban] = await deps.db.select().from(globalIpBans).where(eq(globalIpBans.id, banId)).limit(1);
  if (!ban) throw new Error(ErrorCodes.GLOBAL_IP_BAN_NOT_FOUND);

  const result = await runScript(deps, ['unblock-ip', ban.ip]);
  if (!result.success) throw new Error(ErrorCodes.GLOBAL_IP_BAN_SCRIPT_FAILED);

  await deps.db.delete(globalIpBans).where(eq(globalIpBans.id, banId));
  return { success: true };
}

export async function isGloballyBanned(deps: Deps, ip: string): Promise<boolean> {
  const normalized = normalizeIp(ip);
  const [existing] = await deps.db.select().from(globalIpBans).where(eq(globalIpBans.ip, normalized)).limit(1);
  return Boolean(existing);
}

export async function syncGlobalIpBans(deps: Deps) {
  const bans = await deps.db.select().from(globalIpBans);

  let synced = 0;
  for (const ban of bans) {
    const result = await runScript(deps, ['block-ip', ban.ip]);
    if (result.success) synced++;
  }

  return { total: bans.length, synced };
}
