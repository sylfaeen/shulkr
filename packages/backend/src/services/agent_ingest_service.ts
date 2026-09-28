import { lt } from 'drizzle-orm';
import type { AgentLive, AgentMetricsPayload } from '@shulkr/shared';
import { agentMetricsHistory } from '@shulkr/backend/db/schema';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';
import { updateAgentHeartbeat } from '@shulkr/backend/services/agent_token_service';
import { playersService } from '@shulkr/backend/services/players_service';

const RETENTION_DAYS = 7;
const LIVE_CACHE_TTL_MS = 30_000;
const CLEANUP_INTERVAL_MS = 3_600_000;

type AgentPeriod = '1h' | '6h' | '24h' | '7d' | '30d';
type CachedSnapshot = { payload: AgentMetricsPayload; receivedAt: number };

const liveCache = new Map<string, CachedSnapshot>();

type Deps = Pick<AppDeps, 'db' | 'sqlite' | 'clock'>;

function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function periodToMs(period: AgentPeriod): number {
  switch (period) {
    case '1h':
      return 3_600_000;
    case '6h':
      return 21_600_000;
    case '24h':
      return 86_400_000;
    case '7d':
      return 604_800_000;
    case '30d':
      return 2_592_000_000;
  }
}

function periodToGroupBy(period: AgentPeriod): string {
  switch (period) {
    case '1h':
    case '6h':
    case '24h':
      return "strftime('%Y-%m-%d %H:%M', created_at)";
    case '7d':
      return "strftime('%Y-%m-%d %H:', created_at) || printf('%02d', (CAST(strftime('%M', created_at) AS INTEGER) / 15) * 15)";
    case '30d':
      return "strftime('%Y-%m-%d %H', created_at)";
  }
}

export async function ingestAgentPayload(deps: Deps, serverId: string, payload: AgentMetricsPayload): Promise<void> {
  const now = deps.clock().getTime();
  liveCache.set(serverId, { payload, receivedAt: now });
  await updateAgentHeartbeat(serverId, payload.plugin_version, payload.platform, payload.platform_version ?? null);

  playersService.updateLiveState(
    serverId,
    payload.players.map((p) => ({
      name: p.name,
      ping: p.ping ?? null,
      health: p.health ?? null,
      food: p.food ?? null,
      world: p.world ?? null,
      x: p.x ?? null,
      y: p.y ?? null,
      z: p.z ?? null,
      op: p.op ?? null,
    }))
  );

  await deps.db.insert(agentMetricsHistory).values({
    server_id: serverId,
    tps_avg1m: payload.tps?.avg1m ?? null,
    mspt_avg1m: payload.mspt?.avg1m ?? null,
    player_count: payload.players.length,
    worlds_json: JSON.stringify(payload.worlds ?? []),
    players_json: JSON.stringify(payload.players),
    memory_json: JSON.stringify(payload.memory),
    uptime_ms: payload.uptime_ms,
  });
}

export function getAgentLive(deps: Pick<AppDeps, 'clock'>, serverId: string): AgentLive | null {
  const entry = liveCache.get(serverId);
  if (!entry) return null;
  if (deps.clock().getTime() - entry.receivedAt > LIVE_CACHE_TTL_MS) return null;

  return { ...entry.payload, received_at: new Date(entry.receivedAt).toISOString() };
}

export function queryAgentHistory(deps: Deps, serverId: string, period: AgentPeriod) {
  const since = toSqliteTimestamp(new Date(deps.clock().getTime() - periodToMs(period)));
  const groupExpr = periodToGroupBy(period);

  const rows = deps.sqlite
    .prepare(
      `SELECT ${groupExpr} as bucket,
          AVG(tps_avg1m) as avg_tps,
          AVG(mspt_avg1m) as avg_mspt,
          MAX(player_count) as max_players
        FROM agent_metrics_history
        WHERE server_id = ? AND created_at >= ?
        GROUP BY bucket
        ORDER BY bucket ASC`
    )
    .all(serverId, since) as Array<{
    bucket: string;
    avg_tps: number | null;
    avg_mspt: number | null;
    max_players: number;
  }>;

  return rows.map((row) => ({
    timestamp: row.bucket,
    tps_avg1m: row.avg_tps === null ? null : Math.round(row.avg_tps * 100) / 100,
    mspt_avg1m: row.avg_mspt === null ? null : Math.round(row.avg_mspt * 100) / 100,
    player_count: row.max_players,
  }));
}

export async function cleanupAgentHistory(deps: Deps): Promise<number> {
  const cutoff = toSqliteTimestamp(new Date(deps.clock().getTime() - RETENTION_DAYS * 24 * 3600 * 1000));
  const result = await deps.db.delete(agentMetricsHistory).where(lt(agentMetricsHistory.created_at, cutoff));
  const deleted = result.changes;

  if (deleted > 0) {
    console.log(`[agent-ingest] cleaned up ${deleted} entries older than ${RETENTION_DAYS} days`);
  }

  return deleted;
}

class AgentIngestService {
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  initialize() {
    this.cleanupIntervalId = setInterval(() => {
      cleanupAgentHistory(getAppDeps()).catch((err) => console.error('[agent-ingest] cleanup failed:', err));
    }, CLEANUP_INTERVAL_MS);

    console.log('Agent ingest service initialized (7d retention on agent_metrics_history)');
  }

  async shutdown() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  async ingest(serverId: string, payload: AgentMetricsPayload): Promise<void> {
    return ingestAgentPayload(getAppDeps(), serverId, payload);
  }

  getLive(serverId: string): AgentLive | null {
    return getAgentLive(getAppDeps(), serverId);
  }

  queryHistory(serverId: string, period: AgentPeriod) {
    return queryAgentHistory(getAppDeps(), serverId, period);
  }
}

export const agentIngestService = new AgentIngestService();
