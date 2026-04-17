import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { firewallRules } from '@shulkr/backend/db/schema';
import { type FirewallProtocol, ErrorCodes } from '@shulkr/shared';
import { APP_DIR } from '@shulkr/backend/services/paths';

const SCRIPT_PATH = process.env.FIREWALL_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_firewall.sh');

interface ScriptResult {
  success: boolean;
  error?: string;
}

function runFirewallScript(args: Array<string>): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile('sudo', [SCRIPT_PATH, ...args], { shell: false, timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        let errorMessage = `Firewall script failed: ${error.message}`;
        try {
          const parsed = JSON.parse(stderr || stdout) as { error?: string };
          if (parsed.error) errorMessage = parsed.error;
        } catch {}
        resolve({ success: false, error: errorMessage });
        return;
      }

      try {
        const result = JSON.parse(stdout) as { success?: boolean };
        resolve({ success: result.success !== false });
      } catch {
        resolve({ success: true });
      }
    });
  });
}

export class FirewallService {
  async listRules() {
    return db.select().from(firewallRules);
  }

  async addRule(port: number, protocol: FirewallProtocol, label: string) {
    const [existing] = await db
      .select()
      .from(firewallRules)
      .where(and(eq(firewallRules.port, port), eq(firewallRules.protocol, protocol)))
      .limit(1);

    if (existing) throw new Error(ErrorCodes.FIREWALL_RULE_EXISTS);

    const [rule] = await db
      .insert(firewallRules)
      .values({
        port,
        protocol,
        label,
        enabled: true,
      })
      .returning();

    const result = await runFirewallScript(['allow', String(port), protocol]);

    if (!result.success) {
      await db.delete(firewallRules).where(eq(firewallRules.id, rule.id));
      throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
    }

    return rule;
  }

  async removeRule(ruleId: number) {
    const [rule] = await db.select().from(firewallRules).where(eq(firewallRules.id, ruleId)).limit(1);

    if (!rule) throw new Error(ErrorCodes.FIREWALL_RULE_NOT_FOUND);

    if (rule.enabled) {
      const result = await runFirewallScript(['deny', String(rule.port), rule.protocol]);
      if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
    }

    await db.delete(firewallRules).where(eq(firewallRules.id, ruleId));

    return { success: true };
  }

  async toggleRule(ruleId: number) {
    const [rule] = await db.select().from(firewallRules).where(eq(firewallRules.id, ruleId)).limit(1);

    if (!rule) throw new Error(ErrorCodes.FIREWALL_RULE_NOT_FOUND);

    const newEnabled = !rule.enabled;
    const action = newEnabled ? 'allow' : 'deny';

    const result = await runFirewallScript([action, String(rule.port), rule.protocol]);

    if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);

    const [updated] = await db
      .update(firewallRules)
      .set({
        enabled: newEnabled,
        updated_at: new Date().toISOString(),
      })
      .where(eq(firewallRules.id, ruleId))
      .returning();

    return updated;
  }

  async checkPort(port: number, protocol: FirewallProtocol): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('sudo', [SCRIPT_PATH, 'check', String(port), protocol], { shell: false, timeout: 10000 }, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        try {
          const result = JSON.parse(stdout) as { open: boolean };
          resolve(result.open);
        } catch {
          resolve(false);
        }
      });
    });
  }

  async syncRules() {
    const rules = await db.select().from(firewallRules);
    let synced = 0;

    for (const rule of rules) {
      if (rule.enabled) {
        const result = await runFirewallScript(['allow', String(rule.port), rule.protocol]);
        if (result.success) synced++;
      }
    }

    return { total: rules.length, synced };
  }
}

export const firewallService = new FirewallService();
