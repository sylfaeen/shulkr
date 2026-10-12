import { describe, it, expect } from 'vitest';
import { agentMetricsPayloadSchema } from './agents';

describe('agentMetricsPayloadSchema', () => {
  const player = { uuid: '00000000-0000-0000-0000-000000000000', name: 'Steve', health: 20, food: 20 };

  const payload = {
    protocol_version: 1,
    plugin_version: '1.0.0',
    platform: 'paper',
    collected_at: '2026-10-06T21:09:27.000Z',
    tps: { avg5s: 20, avg1m: 20, avg15m: 20 },
    mspt: { avg5s: 5, avg1m: 5, avg15m: 5 },
    memory: { used: 1, max: 1, heap_used: 1, heap_max: 1, nonheap_used: 1 },
    players: [player],
    uptime_ms: 1000,
  };

  it('accepts health above 20 for players with a raised max_health attribute', () => {
    expect(agentMetricsPayloadSchema.safeParse({ ...payload, players: [{ ...player, health: 40 }] }).success).toBe(true);
  });

  it('accepts a food level above 20 set by a plugin', () => {
    expect(agentMetricsPayloadSchema.safeParse({ ...payload, players: [{ ...player, food: 25 }] }).success).toBe(true);
  });

  it('rejects negative health and food', () => {
    expect(agentMetricsPayloadSchema.safeParse({ ...payload, players: [{ ...player, health: -1 }] }).success).toBe(false);
    expect(agentMetricsPayloadSchema.safeParse({ ...payload, players: [{ ...player, food: -1 }] }).success).toBe(false);
  });
});
