import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const errorSchema = z.object({ code: z.string(), message: z.string() });
const messageSchema = z.object({ message: z.string() });

// ---------- payload sent by the plugin ----------

export const agentPlatformSchema = z.enum(['paper', 'folia', 'velocity', 'waterfall']);
export type AgentPlatform = z.infer<typeof agentPlatformSchema>;

const tpsSnapshotSchema = z.object({
  avg5s: z.number().min(0).max(20),
  avg1m: z.number().min(0).max(20),
  avg15m: z.number().min(0).max(20),
});

const msptSnapshotSchema = z.object({
  avg5s: z.number().min(0),
  avg1m: z.number().min(0),
  avg15m: z.number().min(0),
});

const memorySnapshotSchema = z.object({
  used: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  heap_used: z.number().int().nonnegative(),
  heap_max: z.number().int().nonnegative(),
  nonheap_used: z.number().int().nonnegative(),
});

const agentPlayerSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  // `world` is absent on proxy platforms (velocity / waterfall)
  world: z.string().nullable().optional(),
  // On proxies, `backend` names the linked backend server (e.g. "lobby", "survival")
  backend: z.string().nullable().optional(),
  ping: z.number().int().nullable().optional(),
});

const agentWorldSchema = z.object({
  name: z.string(),
  entities: z.number().int().nonnegative(),
  loaded_chunks: z.number().int().nonnegative(),
  players: z.number().int().nonnegative(),
});

const agentProxyBackendSchema = z.object({
  name: z.string(),
  online_players: z.number().int().nonnegative(),
  reachable: z.boolean(),
});

export const agentMetricsPayloadSchema = z.object({
  protocol_version: z.number().int(),
  plugin_version: z.string(),
  platform: agentPlatformSchema,
  platform_version: z.string().optional(),
  collected_at: z.string(),
  // TPS/MSPT only on game servers (paper / folia)
  tps: tpsSnapshotSchema.nullable().optional(),
  mspt: msptSnapshotSchema.nullable().optional(),
  memory: memorySnapshotSchema,
  players: z.array(agentPlayerSchema),
  // Worlds only on game servers
  worlds: z.array(agentWorldSchema).optional().default([]),
  // Proxy-backends only on velocity / waterfall
  proxy_backends: z.array(agentProxyBackendSchema).optional().default([]),
  uptime_ms: z.number().int().nonnegative(),
});

export type AgentMetricsPayload = z.infer<typeof agentMetricsPayloadSchema>;
export type AgentPlayerSnapshot = z.infer<typeof agentPlayerSchema>;
export type AgentWorldSnapshot = z.infer<typeof agentWorldSchema>;
export type TpsSnapshot = z.infer<typeof tpsSnapshotSchema>;
export type MsptSnapshot = z.infer<typeof msptSnapshotSchema>;
export type MemorySnapshot = z.infer<typeof memorySnapshotSchema>;

// ---------- status exposed to the frontend ----------

export const agentStatusSchema = z.object({
  enabled: z.boolean(),
  installed: z.boolean(),
  connected: z.boolean(),
  last_seen_at: z.string().nullable(),
  plugin_version: z.string().nullable(),
  expected_version: z.string(),
  version_mismatch: z.boolean(),
  token_preview: z.string().nullable(),
  platform: agentPlatformSchema.nullable(),
  platform_version: z.string().nullable(),
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;

// ---------- enable / regenerate token responses ----------

export const agentTokenResponseSchema = z.object({
  token: z.string(),
  preview: z.string(),
  createdAt: z.string(),
});

export type AgentTokenResponse = z.infer<typeof agentTokenResponseSchema>;

// ---------- live data exposed to the Analytics page ----------

export const agentLiveSchema = agentMetricsPayloadSchema.extend({
  received_at: z.string(),
});

export type AgentLive = z.infer<typeof agentLiveSchema>;

// ---------- history for Analytics ----------

const agentHistoryPointSchema = z.object({
  timestamp: z.string(),
  tps_avg1m: z.number().nullable(),
  mspt_avg1m: z.number().nullable(),
  player_count: z.number().int().nonnegative(),
});

export type AgentHistoryPoint = z.infer<typeof agentHistoryPointSchema>;

// ---------- install response ----------

const agentInstallResponseSchema = z.object({
  message: z.string(),
  jarPath: z.string(),
  configPath: z.string(),
  restartRequired: z.boolean(),
});

// ---------- contract ----------

export const agentsContract = c.router({
  // Plugin -> backend ingestion (bearer token auth, not JWT)
  ingestMetrics: {
    method: 'POST',
    path: '/api/agents/:serverId/metrics',
    body: agentMetricsPayloadSchema,
    responses: {
      204: z.null(),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      422: errorSchema,
      429: errorSchema,
    },
  },
  // Admin-facing endpoints (JWT auth)
  getAgentStatus: {
    method: 'GET',
    path: '/api/servers/:id/agent',
    responses: {
      200: agentStatusSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  enableAgent: {
    method: 'POST',
    path: '/api/servers/:id/agent/enable',
    body: z.object({}).optional(),
    responses: {
      200: agentTokenResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  regenerateAgentToken: {
    method: 'POST',
    path: '/api/servers/:id/agent/regenerate',
    body: z.object({}).optional(),
    responses: {
      200: agentTokenResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  disableAgent: {
    method: 'POST',
    path: '/api/servers/:id/agent/disable',
    body: z.object({}).optional(),
    responses: {
      200: messageSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  installAgent: {
    method: 'POST',
    path: '/api/servers/:id/agent/install',
    body: z.object({ platform: agentPlatformSchema }),
    responses: {
      200: agentInstallResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      500: errorSchema,
    },
  },
  updateAgent: {
    method: 'POST',
    path: '/api/servers/:id/agent/update',
    body: z.object({ platform: agentPlatformSchema }),
    responses: {
      200: agentInstallResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      500: errorSchema,
    },
  },
  getAgentLive: {
    method: 'GET',
    path: '/api/servers/:id/agent/live',
    responses: {
      200: agentLiveSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  getAgentHistory: {
    method: 'GET',
    path: '/api/servers/:id/agent/history',
    query: z.object({
      period: z.enum(['1h', '6h', '24h', '7d', '30d']).optional(),
    }),
    responses: {
      200: z.object({
        points: z.array(agentHistoryPointSchema),
        period: z.string(),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
});
