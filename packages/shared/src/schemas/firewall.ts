import { z } from 'zod';

const RESERVED_PORTS = [22, 80, 443, 3000, 3001];
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export const firewallProtocolSchema = z.enum(['tcp', 'udp', 'both']);
export type FirewallProtocol = z.infer<typeof firewallProtocolSchema>;

export const firewallActionSchema = z.enum(['allow', 'deny']);
export type FirewallAction = z.infer<typeof firewallActionSchema>;

// Port spec: empty/null (any), single port "25565", or range "1024:65535".
const portSpecRegex = /^(\d+)(?::(\d+))?$/;

const portSpecSchema = z
  .string()
  .regex(portSpecRegex, 'Invalid port spec, expected a number or a range like 1024:65535')
  .refine((spec) => {
    const match = spec.match(portSpecRegex);
    if (!match) return false;
    const low = Number(match[1]);
    const high = match[2] ? Number(match[2]) : low;
    if (low < MIN_PORT || high > MAX_PORT) return false;
    if (low > high) return false;

    return true;
  }, `Port must be between ${MIN_PORT} and ${MAX_PORT}, range low must be <= high`)
  .refine((spec) => {
    const match = spec.match(portSpecRegex);
    if (!match) return false;
    const low = Number(match[1]);
    const high = match[2] ? Number(match[2]) : low;

    return !RESERVED_PORTS.some((p) => p >= low && p <= high);
  }, 'Port range must not include reserved ports');

const ipAddressSchema = z.string().refine((v) => {
  if (v.includes(':')) return /^[0-9a-fA-F:]+$/.test(v);

  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every((o) => Number(o) <= 255);
}, 'Invalid IP address');

export const createFirewallRuleSchema = z
  .object({
    action: firewallActionSchema,
    port: portSpecSchema.nullable().optional(),
    protocol: firewallProtocolSchema,
    from_ip: ipAddressSchema.nullable().optional(),
    label: z.string().min(1, 'Label is required').max(100, 'Label must be at most 100 characters'),
  })
  .refine((data) => Boolean(data.port) || Boolean(data.from_ip), {
    message: 'Either port or from_ip must be set',
    path: ['port'],
  });

export type CreateFirewallRuleRequest = z.infer<typeof createFirewallRuleSchema>;

export const firewallRuleResponseSchema = z.object({
  id: z.number(),
  action: firewallActionSchema,
  port: z.string().nullable(),
  protocol: firewallProtocolSchema,
  from_ip: z.string().nullable(),
  label: z.string(),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FirewallRuleResponse = z.infer<typeof firewallRuleResponseSchema>;
