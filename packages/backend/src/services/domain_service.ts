import { execFile } from 'node:child_process';
import os from 'node:os';
import { resolve } from 'node:path';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { customDomains } from '@shulkr/backend/db/schema';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { updateEnvVariable } from '@shulkr/backend/services/env_service';
import type { DomainType } from '@shulkr/shared';

const SCRIPT_PATH = process.env.DOMAIN_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_domain.sh');

export interface ScriptResult {
  success: boolean;
  error?: string;
  ssl_expires_at?: string;
  note?: string;
}

function runDomainScript(args: Array<string>): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT_PATH, ...args], { shell: false, timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        let errorMessage = `Domain script failed: ${error.message}`;
        try {
          const parsed = JSON.parse(stderr || stdout) as { error?: string };
          if (parsed.error) errorMessage = parsed.error;
        } catch {}
        resolve({ success: false, error: errorMessage });
        return;
      }

      try {
        const result = JSON.parse(stdout) as ScriptResult;
        resolve({ ...result, success: result.success !== false });
      } catch {
        resolve({ success: true });
      }
    });
  });
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

function restartService(): void {
  setTimeout(() => {
    execFile('sudo', ['systemctl', 'restart', 'shulkr'], { shell: false, timeout: 15000 }, () => {});
  }, 2000);
}

export class DomainService {
  async listByServer(serverId: string) {
    return db.select().from(customDomains).where(eq(customDomains.server_id, serverId));
  }

  async getPanelDomain() {
    const [domain] = await db
      .select()
      .from(customDomains)
      .where(and(isNull(customDomains.server_id), eq(customDomains.type, 'panel')))
      .limit(1);
    return domain ?? null;
  }

  async addDomain(serverId: string, domain: string, port: number, type: DomainType) {
    const [existing] = await db.select().from(customDomains).where(eq(customDomains.domain, domain)).limit(1);

    if (existing) throw new Error(`Domain ${domain} is already configured`);

    const result = await runDomainScript(['add', domain, String(port), type]);
    if (!result.success) throw new Error(result.error || 'Failed to add domain');

    const [created] = await db.insert(customDomains).values({ server_id: serverId, domain, port, type }).returning();

    return created;
  }

  async removeDomain(id: number) {
    const [domain] = await db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const result = await runDomainScript(['remove', domain.domain]);
    if (!result.success) throw new Error(result.error || 'Failed to remove domain');

    await db.delete(customDomains).where(eq(customDomains.id, id));
    return { success: true };
  }

  async enableSsl(id: number) {
    const [domain] = await db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
    if (!domain) throw new Error('Domain not found');

    if (domain.ssl_enabled) return domain;

    const result = await runDomainScript(['enable-ssl', domain.domain]);
    if (!result.success) throw new Error(result.error || 'Failed to enable SSL');

    const [updated] = await db
      .update(customDomains)
      .set({
        ssl_enabled: true,
        ssl_expires_at: result.ssl_expires_at || null,
      })
      .where(eq(customDomains.id, id))
      .returning();

    if (domain.type === 'panel') {
      updateEnvVariable('CORS_ORIGIN', `https://${domain.domain}`);
      updateEnvVariable('SECURE_COOKIES', 'true');
      restartService();
    }

    return updated;
  }

  async dnsCheck(domain: string): Promise<{ matches: boolean; resolvedIp: string | null; serverIp: string }> {
    return new Promise((resolve) => {
      execFile('sudo', [SCRIPT_PATH, 'dns-check', domain], { shell: false, timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          const errorStr = stderr || stdout || '';
          const mismatchMatch = errorStr.match(/resolves to (\S+) but server IP is (\S+)/);
          if (mismatchMatch) {
            resolve({ matches: false, resolvedIp: mismatchMatch[1], serverIp: mismatchMatch[2] });
            return;
          }
          resolve({ matches: false, resolvedIp: null, serverIp: '' });
          return;
        }
        try {
          const result = JSON.parse(stdout) as { matches: boolean; resolved_ip: string; server_ip: string };
          resolve({ matches: result.matches, resolvedIp: result.resolved_ip, serverIp: result.server_ip });
        } catch {
          resolve({ matches: false, resolvedIp: null, serverIp: '' });
        }
      });
    });
  }

  async setPanelDomain(domain: string, port: number) {
    const existing = await this.getPanelDomain();
    if (existing) {
      await this.removePanelDomain();
    }

    const result = await runDomainScript(['update-panel', domain]);
    if (!result.success) throw new Error(result.error || 'Failed to update panel domain');

    const [created] = await db.insert(customDomains).values({ server_id: null, domain, port, type: 'panel' }).returning();

    updateEnvVariable('CORS_ORIGIN', `http://${domain}`);
    restartService();

    return created;
  }

  async removePanelDomain() {
    const panelDomain = await this.getPanelDomain();
    if (!panelDomain) throw new Error('No panel domain configured');
    const result = await runDomainScript(['reset-panel']);
    if (!result.success) throw new Error(result.error || 'Failed to reset panel domain');

    await db.delete(customDomains).where(eq(customDomains.id, panelDomain.id));

    const serverIp = getServerIp();
    updateEnvVariable('CORS_ORIGIN', `http://${serverIp}`);
    updateEnvVariable('SECURE_COOKIES', 'false');
    restartService();

    return { success: true };
  }

  async renewAll() {
    const result = await runDomainScript(['renew']);
    if (result.success) {
      await this.refreshAllSslExpiry();
    }
    return result;
  }

  async refreshSslExpiry(id: number) {
    const [domain] = await db.select().from(customDomains).where(eq(customDomains.id, id)).limit(1);
    if (!domain || !domain.ssl_enabled) return null;

    const result = await runDomainScript(['check-expiry', domain.domain]);
    if (result.success === false) return null;

    const parsed = result as unknown as { ssl_expires_at?: string; days_left?: number };
    if (parsed.ssl_expires_at) {
      const [updated] = await db
        .update(customDomains)
        .set({ ssl_expires_at: parsed.ssl_expires_at })
        .where(eq(customDomains.id, id))
        .returning();
      return { ...updated, daysLeft: parsed.days_left ?? null };
    }

    return null;
  }

  async refreshAllSslExpiry() {
    const sslDomains = await db.select().from(customDomains).where(eq(customDomains.ssl_enabled, true));
    for (const domain of sslDomains) {
      await this.refreshSslExpiry(domain.id);
    }
  }

  async ensureCertbotTimer() {
    return runDomainScript(['ensure-timer']);
  }

  async cleanupServerDomains(serverId: string) {
    const domains = await db.select().from(customDomains).where(eq(customDomains.server_id, serverId));

    for (const domain of domains) {
      await runDomainScript(['remove', domain.domain]);
    }

    await db.delete(customDomains).where(eq(customDomains.server_id, serverId));
  }
}

export const domainService = new DomainService();
