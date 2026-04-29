import { eq, lt, desc } from 'drizzle-orm';
import { metricsHistory } from '@shulkr/backend/db/schema';
import { getServerMetrics } from '@shulkr/backend/services/metrics_service';
import { playersService } from '@shulkr/backend/services/players_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { evaluateAlerts } from '@shulkr/backend/services/alert_service';
import { collectTps } from '@shulkr/backend/services/tps_service';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

const SAMPLE_INTERVAL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 3_600_000;
const DEFAULT_RETENTION_DAYS = 30;

function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export type MetricsPeriod = '1h' | '6h' | '24h' | '7d' | '30d';

type AggregatedMetric = {
  timestamp: string;
  cpu: number;
  memoryPercent: number;
  playerCount: number;
  tps: number | null;
  mspt: number | null;
};

type Deps = Pick<AppDeps, 'db' | 'sqlite' | 'clock'>;

let sampleIntervalId: NodeJS.Timeout | null = null;
let cleanupIntervalId: NodeJS.Timeout | null = null;

function periodToMs(period: MetricsPeriod): number {
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

function periodToGroupBy(period: MetricsPeriod): string {
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

async function sampleAllServers(deps: Deps): Promise<void> {
  const runningServers = serverProcessManager.getRunningServers();
  for (const serverId of runningServers) {
    try {
      const metrics = await getServerMetrics(getAppDeps(), serverId);
      if (!metrics) continue;
      const playerCount = playersService.getPlayerCount(serverId);
      const tpsData = collectTps(getAppDeps(), serverId);
      await deps.db.insert(metricsHistory).values({
        server_id: serverId,
        cpu: metrics.cpu,
        memory: metrics.memory,
        memory_percent: metrics.memory_percent,
        player_count: playerCount,
        tps: tpsData.tps,
        mspt: tpsData.mspt,
      });
      evaluateAlerts(getAppDeps(), serverId, {
        cpu: metrics.cpu,
        memoryPercent: metrics.memory_percent,
        tps: tpsData.tps ?? undefined,
      }).catch((err: unknown) => console.error(`Alert evaluation failed for ${serverId}:`, err));
    } catch (error: unknown) {
      console.error(`Metrics history: failed to sample server ${serverId}:`, error);
    }
  }
}

async function cleanupMetricsHistory(deps: Deps): Promise<void> {
  const cutoff = toSqliteTimestamp(new Date(deps.clock().getTime() - DEFAULT_RETENTION_DAYS * 24 * 3600 * 1000));
  const result = await deps.db.delete(metricsHistory).where(lt(metricsHistory.created_at, cutoff));
  const deleted = result.changes;
  if (deleted > 0) {
    console.log(`Metrics history: cleaned up ${deleted} entries older than ${DEFAULT_RETENTION_DAYS} days`);
  }
}

export function initializeMetricsHistory(deps: Deps): void {
  sampleIntervalId = setInterval(() => {
    void sampleAllServers(deps);
  }, SAMPLE_INTERVAL_MS);
  sampleIntervalId.unref();
  cleanupIntervalId = setInterval(() => {
    void cleanupMetricsHistory(deps);
  }, CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref();
  console.log('Metrics history service initialized (60s sampling, 30d retention)');
}

export async function shutdownMetricsHistory(): Promise<void> {
  if (sampleIntervalId) {
    clearInterval(sampleIntervalId);
    sampleIntervalId = null;
  }
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  console.log('Metrics history service shut down');
}

export function queryMetricsHistory(deps: Deps, serverId: string, period: MetricsPeriod): Array<AggregatedMetric> {
  const now = deps.clock().getTime();
  const since = toSqliteTimestamp(new Date(now - periodToMs(period)));
  const groupExpr = periodToGroupBy(period);

  const rows = deps.sqlite
    .prepare(
      `SELECT ${groupExpr} as bucket,
          AVG(cpu) as avg_cpu,
          AVG(memory_percent) as avg_mem,
          MAX(player_count) as max_players,
          AVG(tps) as avg_tps,
          AVG(mspt) as avg_mspt
        FROM metrics_history
        WHERE server_id = ? AND created_at >= ?
        GROUP BY bucket
        ORDER BY bucket ASC`
    )
    .all(serverId, since) as Array<{
    bucket: string;
    avg_cpu: number;
    avg_mem: number;
    max_players: number;
    avg_tps: number | null;
    avg_mspt: number | null;
  }>;

  return rows.map((row) => ({
    timestamp: row.bucket,
    cpu: Math.round(row.avg_cpu * 100) / 100,
    memoryPercent: Math.round(row.avg_mem * 100) / 100,
    playerCount: row.max_players,
    tps: row.avg_tps !== null ? Math.round(row.avg_tps * 100) / 100 : null,
    mspt: row.avg_mspt !== null ? Math.round(row.avg_mspt * 100) / 100 : null,
  }));
}

export async function getLatestMetricsEntries(deps: Deps, serverId: string, limit: number): Promise<Array<AggregatedMetric>> {
  const rows = await deps.db
    .select()
    .from(metricsHistory)
    .where(eq(metricsHistory.server_id, serverId))
    .orderBy(desc(metricsHistory.created_at))
    .limit(limit);
  return rows.reverse().map((row) => ({
    timestamp: row.created_at,
    cpu: row.cpu,
    memoryPercent: row.memory_percent,
    playerCount: row.player_count,
    tps: row.tps,
    mspt: row.mspt,
  }));
}
