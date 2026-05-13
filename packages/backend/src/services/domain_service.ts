import os from 'node:os';
import { resolve } from 'node:path';
import { eq, and, isNull } from 'drizzle-orm';
import { customDomains } from '@shulkr/backend/db/schema';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { envUpdate } from '@shulkr/backend/services/env_service';
import type { DomainType } from '@shulkr/shared';
import { type AppDeps } from '@shulkr/backend/deps';

const SCRIPT_PATH = process.env.DOMAIN_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_domain.sh');

export interface ScriptResult {
  success: boolean;
  error?: string;
  ssl_expires_at?: string;
  note?: string;
}

type Deps = Pick<AppDeps, 'db' | 'shell' | 'fs'>;

async function runDomainScript(deps: Deps, args: Array<string>): Promise<ScriptResult> {
  const result = await deps.shell.run('sudo', [SCRIPT_PATH, ...args], { timeoutMs: 60000 });

  if (!result.success) {
    let errorMessage = `Domain script failed: ${result.stderr || result.stdout || 'unknown error'}`;

    try {
      const parsed = JSON.parse(result.stderr || result.stdout) as { error?: string };
      if (parsed.error) errorMessage = parsed.error;
    } catch {}

    return { success: false, error: errorMessage };
  }

  try {
    const parsed = JSON.parse(result.stdout) as ScriptResult;

    return { ...parsed, success: parsed.success !== false };
  } catch {
    return { success: true };
  }
}

function getServerIp(): string {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;

    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') {
        return entry.address;
      }
    }
  }

  return 'localhost';
}

function restartService(deps: Pick<AppDeps, 'shell'>): void {
  setTimeout(() => {
    deps.shell.run('sudo', ['systemctl', 'restart', 'shulkr'], { timeoutMs: 15000 }).catch(() => {});
  }, 2000);
}

export async function listDomainsByServer(deps: Deps, serverId: string) {
  return deps.db.select().from(customDomains).where(eq(customDomains.server_id, serverId));
}

export async function getPanelDomain(deps: Deps) {
  const [domain] = await deps.db
    .select()
    .from(customDomains)
    .where(and(isNull(customDomains.server_id), eq(customDomains.type, 'panel')))
    .limit(1);

  return domain ?? null;
}

export async function addDomain(deps: Deps, serverId: string, domain: string, port: number, type: DomainType) {
  const [existing] = await deps.db.select().from(customDomains).where(eq(customDomains.domain, domain)).limit(1);
  if (existing) throw new Error(`Domain ${domain} is already configured`);

  const result = await runDomainScript(deps, ['add', domain, String(port), type]);
  if (!result.success) throw new Error(result.error || 'Failed to add domain');

  const [created] = await deps.db.insert(customDomains).values({ server_id: serverId, domain, port, type }).returning();

  return created;
}

export async function removeDomain(deps: Deps, id: number) {
  const [domain] = await deps.db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
  if (!domain) throw new Error('Domain not found');

  const result = await runDomainScript(deps, ['remove', domain.domain]);
  if (!result.success) throw new Error(result.error || 'Failed to remove domain');
  await deps.db.delete(customDomains).where(eq(customDomains.id, id));

  return { success: true };
}

export async function enableDomainSsl(deps: Deps, id: number) {
  const [domain] = await deps.db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
  if (!domain) throw new Error('Domain not found');
  if (domain.ssl_enabled) return domain;

  const result = await runDomainScript(deps, ['enable-ssl', domain.domain]);
  if (!result.success) throw new Error(result.error || 'Failed to enable SSL');

  const [updated] = await deps.db
    .update(customDomains)
    .set({
      ssl_enabled: true,
      ssl_expires_at: result.ssl_expires_at || null,
    })
    .where(eq(customDomains.id, id))
    .returning();

  if (domain.type === 'panel') {
    await envUpdate(deps, 'CORS_ORIGIN', `https://${domain.domain}`);
    await envUpdate(deps, 'SECURE_COOKIES', 'true');
    restartService(deps);
  }

  return updated;
}

export async function dnsCheckDomain(
  deps: Deps,
  domain: string
): Promise<{ matches: boolean; resolvedIp: string | null; serverIp: string }> {
  const result = await deps.shell.run('sudo', [SCRIPT_PATH, 'dns-check', domain], { timeoutMs: 15000 });

  if (!result.success) {
    const errorStr = result.stderr || result.stdout || '';
    const mismatchMatch = errorStr.match(/resolves to (\S+) but server IP is (\S+)/);

    if (mismatchMatch) {
      return { matches: false, resolvedIp: mismatchMatch[1], serverIp: mismatchMatch[2] };
    }

    return { matches: false, resolvedIp: null, serverIp: '' };
  }

  try {
    const parsed = JSON.parse(result.stdout) as { matches: boolean; resolved_ip: string; server_ip: string };

    return { matches: parsed.matches, resolvedIp: parsed.resolved_ip, serverIp: parsed.server_ip };
  } catch {
    return { matches: false, resolvedIp: null, serverIp: '' };
  }
}

export async function setPanelDomain(deps: Deps, domain: string, port: number) {
  const existing = await getPanelDomain(deps);

  if (existing) {
    await removePanelDomain(deps);
  }

  const result = await runDomainScript(deps, ['update-panel', domain]);
  if (!result.success) throw new Error(result.error || 'Failed to update panel domain');

  const [created] = await deps.db.insert(customDomains).values({ server_id: null, domain, port, type: 'panel' }).returning();
  await envUpdate(deps, 'CORS_ORIGIN', `http://${domain}`);
  restartService(deps);

  return created;
}

export async function removePanelDomain(deps: Deps) {
  const panelDomain = await getPanelDomain(deps);
  if (!panelDomain) throw new Error('No panel domain configured');

  const result = await runDomainScript(deps, ['reset-panel']);
  if (!result.success) throw new Error(result.error || 'Failed to reset panel domain');
  await deps.db.delete(customDomains).where(eq(customDomains.id, panelDomain.id));

  const serverIp = getServerIp();
  await envUpdate(deps, 'CORS_ORIGIN', `http://${serverIp}`);
  await envUpdate(deps, 'SECURE_COOKIES', 'false');
  restartService(deps);

  return { success: true };
}

export async function refreshDomainSslExpiry(deps: Deps, id: number) {
  const [domain] = await deps.db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
  if (!domain || !domain.ssl_enabled) return null;

  const result = await runDomainScript(deps, ['check-expiry', domain.domain]);
  if (result.success === false) return null;

  const parsed = result as unknown as { ssl_expires_at?: string; days_left?: number };

  if (parsed.ssl_expires_at) {
    const [updated] = await deps.db
      .update(customDomains)
      .set({ ssl_expires_at: parsed.ssl_expires_at })
      .where(eq(customDomains.id, id))
      .returning();

    return { ...updated, daysLeft: parsed.days_left ?? null };
  }

  return null;
}

export async function refreshAllDomainsSslExpiry(deps: Deps) {
  const sslDomains = await deps.db.select().from(customDomains).where(eq(customDomains.ssl_enabled, true));

  for (const domain of sslDomains) {
    await refreshDomainSslExpiry(deps, domain.id);
  }
}

export async function renewAllDomains(deps: Deps) {
  const result = await runDomainScript(deps, ['renew']);

  if (result.success) {
    await refreshAllDomainsSslExpiry(deps);
  }

  return result;
}

export async function ensureCertbotTimer(deps: Deps) {
  return runDomainScript(deps, ['ensure-timer']);
}

export async function cleanupServerDomains(deps: Deps, serverId: string) {
  const domains = await deps.db.select().from(customDomains).where(eq(customDomains.server_id, serverId));

  for (const domain of domains) {
    await runDomainScript(deps, ['remove', domain.domain]);
  }

  await deps.db.delete(customDomains).where(eq(customDomains.server_id, serverId));
}
