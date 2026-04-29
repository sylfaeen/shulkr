import { resolve } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { firewallRules } from '@shulkr/backend/db/schema';
import { type FirewallProtocol, ErrorCodes } from '@shulkr/shared';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { type AppDeps } from '@shulkr/backend/deps';

const SCRIPT_PATH = process.env.FIREWALL_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_firewall.sh');

interface ScriptResult {
  success: boolean;
  error?: string;
}

type Deps = Pick<AppDeps, 'db' | 'shell' | 'clock'>;

async function runFirewallScript(deps: Deps, args: Array<string>): Promise<ScriptResult> {
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

export async function listFirewallRules(deps: Deps) {
  return deps.db.select().from(firewallRules);
}

export async function addFirewallRule(
  deps: Deps,
  port: number,
  protocol: FirewallProtocol,
  label: string,
  options: { reuseExisting?: boolean } = {}
) {
  const [existing] = await deps.db
    .select()
    .from(firewallRules)
    .where(and(eq(firewallRules.port, port), eq(firewallRules.protocol, protocol)))
    .limit(1);

  if (existing) {
    if (options.reuseExisting) {
      const [updated] = await deps.db
        .update(firewallRules)
        .set({ label, updated_at: deps.clock().toISOString() })
        .where(eq(firewallRules.id, existing.id))
        .returning();
      if (!existing.enabled) {
        const result = await runFirewallScript(deps, ['allow', String(port), protocol]);
        if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
        await deps.db.update(firewallRules).set({ enabled: true }).where(eq(firewallRules.id, existing.id));
      }
      return updated;
    }
    throw new Error(ErrorCodes.FIREWALL_RULE_EXISTS);
  }

  const [rule] = await deps.db
    .insert(firewallRules)
    .values({
      port,
      protocol,
      label,
      enabled: true,
    })
    .returning();

  const result = await runFirewallScript(deps, ['allow', String(port), protocol]);
  if (!result.success) {
    await deps.db.delete(firewallRules).where(eq(firewallRules.id, rule.id));
    throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
  }
  return rule;
}

export async function removeFirewallRule(deps: Deps, ruleId: number) {
  const [rule] = await deps.db.select().from(firewallRules).where(eq(firewallRules.id, ruleId)).limit(1);
  if (!rule) throw new Error(ErrorCodes.FIREWALL_RULE_NOT_FOUND);

  if (rule.enabled) {
    const result = await runFirewallScript(deps, ['deny', String(rule.port), rule.protocol]);
    if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
  }
  await deps.db.delete(firewallRules).where(eq(firewallRules.id, ruleId));
  return { success: true };
}

export async function removeFirewallRuleByPort(deps: Deps, port: number, protocol: FirewallProtocol) {
  const [rule] = await deps.db
    .select()
    .from(firewallRules)
    .where(and(eq(firewallRules.port, port), eq(firewallRules.protocol, protocol)))
    .limit(1);
  if (!rule) return { success: true };
  return removeFirewallRule(deps, rule.id);
}

export async function toggleFirewallRule(deps: Deps, ruleId: number) {
  const [rule] = await deps.db.select().from(firewallRules).where(eq(firewallRules.id, ruleId)).limit(1);
  if (!rule) throw new Error(ErrorCodes.FIREWALL_RULE_NOT_FOUND);

  const newEnabled = !rule.enabled;
  const action = newEnabled ? 'allow' : 'deny';
  const result = await runFirewallScript(deps, [action, String(rule.port), rule.protocol]);
  if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);

  const [updated] = await deps.db
    .update(firewallRules)
    .set({
      enabled: newEnabled,
      updated_at: deps.clock().toISOString(),
    })
    .where(eq(firewallRules.id, ruleId))
    .returning();
  return updated;
}

export async function checkFirewallPort(deps: Deps, port: number, protocol: FirewallProtocol): Promise<boolean> {
  const result = await deps.shell.run('sudo', [SCRIPT_PATH, 'check', String(port), protocol], { timeoutMs: 10000 });
  if (!result.success) return false;
  try {
    const parsed = JSON.parse(result.stdout) as { open: boolean };
    return parsed.open;
  } catch {
    return false;
  }
}

export async function syncFirewallRules(deps: Deps) {
  const rules = await deps.db.select().from(firewallRules);
  let synced = 0;
  for (const rule of rules) {
    if (rule.enabled) {
      const result = await runFirewallScript(deps, ['allow', String(rule.port), rule.protocol]);
      if (result.success) synced++;
    }
  }
  return { total: rules.length, synced };
}
