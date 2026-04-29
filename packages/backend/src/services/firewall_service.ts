import { resolve } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { firewallRules } from '@shulkr/backend/db/schema';
import { type FirewallAction, type FirewallProtocol, ErrorCodes } from '@shulkr/shared';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { type AppDeps } from '@shulkr/backend/deps';

const SCRIPT_PATH = process.env.FIREWALL_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_firewall.sh');

interface ScriptResult {
  success: boolean;
  error?: string;
}

type Deps = Pick<AppDeps, 'db' | 'shell' | 'clock'>;

export type FirewallRuleInput = {
  action: FirewallAction;
  port: string | null;
  protocol: FirewallProtocol;
  from_ip: string | null;
  label: string;
};

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

function applyArgs(action: FirewallAction, rule: { port: string | null; protocol: FirewallProtocol; from_ip: string | null }) {
  return [action, rule.port ?? '', rule.protocol, rule.from_ip ?? ''];
}

export async function listFirewallRules(deps: Deps) {
  return deps.db.select().from(firewallRules);
}

export async function addFirewallRule(deps: Deps, input: FirewallRuleInput) {
  if (!input.port && !input.from_ip) throw new Error(ErrorCodes.FIREWALL_RULE_INCOMPLETE);

  const [rule] = await deps.db
    .insert(firewallRules)
    .values({
      action: input.action,
      port: input.port,
      protocol: input.protocol,
      from_ip: input.from_ip,
      label: input.label,
      enabled: true,
    })
    .returning();

  const result = await runFirewallScript(deps, applyArgs(input.action, input));
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
    const inverse: FirewallAction = rule.action === 'allow' ? 'deny' : 'allow';
    const result = await runFirewallScript(deps, applyArgs(inverse, rule));
    if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);
  }
  await deps.db.delete(firewallRules).where(eq(firewallRules.id, ruleId));
  return { success: true };
}

export async function toggleFirewallRule(deps: Deps, ruleId: number) {
  const [rule] = await deps.db.select().from(firewallRules).where(eq(firewallRules.id, ruleId)).limit(1);
  if (!rule) throw new Error(ErrorCodes.FIREWALL_RULE_NOT_FOUND);

  const nextEnabled = !rule.enabled;
  const inverse: FirewallAction = rule.action === 'allow' ? 'deny' : 'allow';
  const scriptAction: FirewallAction = nextEnabled ? rule.action : inverse;
  const result = await runFirewallScript(deps, applyArgs(scriptAction, rule));
  if (!result.success) throw new Error(ErrorCodes.FIREWALL_SCRIPT_FAILED);

  const [updated] = await deps.db
    .update(firewallRules)
    .set({ enabled: nextEnabled, updated_at: deps.clock().toISOString() })
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

// Idempotent allow rule for a single port + protocol with no from-IP.
// Used by server creation to make sure the Minecraft port is open without
// failing on rerun.
export async function ensureAllowPort(deps: Deps, port: number, protocol: FirewallProtocol, label: string) {
  const portStr = String(port);
  const [existing] = await deps.db
    .select()
    .from(firewallRules)
    .where(
      and(
        eq(firewallRules.action, 'allow'),
        eq(firewallRules.port, portStr),
        eq(firewallRules.protocol, protocol),
        isNull(firewallRules.from_ip)
      )
    )
    .limit(1);
  if (existing) {
    if (!existing.enabled) await toggleFirewallRule(deps, existing.id);
    return existing;
  }
  return addFirewallRule(deps, { action: 'allow', port: portStr, protocol, from_ip: null, label });
}

// Removes the allow rule (if any) for a single port + protocol with no from-IP.
// Used when a server is deleted.
export async function removeAllowPort(deps: Deps, port: number, protocol: FirewallProtocol) {
  const portStr = String(port);
  const [rule] = await deps.db
    .select()
    .from(firewallRules)
    .where(
      and(
        eq(firewallRules.action, 'allow'),
        eq(firewallRules.port, portStr),
        eq(firewallRules.protocol, protocol),
        isNull(firewallRules.from_ip)
      )
    )
    .limit(1);
  if (!rule) return { success: true };
  return removeFirewallRule(deps, rule.id);
}

export async function syncFirewallRules(deps: Deps) {
  const rules = await deps.db.select().from(firewallRules);
  let synced = 0;
  for (const rule of rules) {
    if (rule.enabled) {
      const result = await runFirewallScript(deps, applyArgs(rule.action, rule));
      if (result.success) synced++;
    }
  }
  return { total: rules.length, synced };
}
