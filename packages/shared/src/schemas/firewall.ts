import { z } from 'zod';

const RESERVED_PORTS = [22, 80, 443, 3000, 3001];

export const firewallProtocolSchema = z.enum(['tcp', 'udp', 'both']);

export type FirewallProtocol = z.infer<typeof firewallProtocolSchema>;

export const createFirewallRuleSchema = z.object({
  port: z
    .number()
    .int()
    .min(1024, 'Port must be at least 1024')
    .max(65535, 'Port must be at most 65535')
    .refine((p) => !RESERVED_PORTS.includes(p), 'This port is reserved'),
  protocol: firewallProtocolSchema,
  label: z.string().min(1, 'Label is required').max(100, 'Label must be at most 100 characters'),
});

export type CreateFirewallRuleRequest = z.infer<typeof createFirewallRuleSchema>;

export const firewallRuleResponseSchema = z.object({
  id: z.number(),
  port: z.number(),
  protocol: firewallProtocolSchema,
  label: z.string(),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FirewallRuleResponse = z.infer<typeof firewallRuleResponseSchema>;
