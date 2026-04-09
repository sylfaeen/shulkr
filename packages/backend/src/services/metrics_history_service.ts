import { eq, lt, desc } from 'drizzle-orm';
import { db, sqlite } from '@shulkr/backend/db';
import { metricsHistory } from '@shulkr/backend/db/schema';
import { metricsService } from '@shulkr/backend/services/metrics_service';
import { playersService } from '@shulkr/backend/services/players_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

const SAMPLE_INTERVAL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 3_600_000;
const DEFAULT_RETENTION_DAYS = 7;

function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export type MetricsPeriod = '1h' | '6h' | '24h' | '7d' | '30d';

type AggregatedMetric = {
  timestamp: string;
  cpu: number;
  memoryPercent: number;
  playerCount: number;
};

class MetricsHistoryService {
  private sampleIntervalId: NodeJS.Timeout | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  initialize() {
    this.sampleIntervalId = setInterval(() => {
      this.sampleAllServers();
    }, SAMPLE_INTERVAL_MS);

    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    console.log('Metrics history service initialized (60s sampling, 7d retention)');
  }

  private async sampleAllServers() {
    const runningServers = serverProcessManager.getRunningServers();

    for (const serverId of runningServers) {
      try {
        const metrics = await metricsService.getServerMetrics(serverId);
        if (!metrics) continue;

        const playerCount = playersService.getPlayerCount(serverId);

        await db.insert(metricsHistory).values({
          server_id: serverId,
          cpu: metrics.cpu,
          memory: metrics.memory,
          memory_percent: metrics.memory_percent,
          player_count: playerCount,
        });
      } catch (error: unknown) {
        console.error(`Metrics history: failed to sample server ${serverId}:`, error);
      }
    }
  }

  private async cleanup() {
    const cutoff = toSqliteTimestamp(new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 3600 * 1000));

    const result = await db.delete(metricsHistory).where(lt(metricsHistory.created_at, cutoff));
    const deleted = result.changes;

    if (deleted > 0) {
      console.log(`Metrics history: cleaned up ${deleted} entries older than ${DEFAULT_RETENTION_DAYS} days`);
    }
  }

  queryHistory(serverId: string, period: MetricsPeriod): Array<AggregatedMetric> {
    const now = Date.now();
    const periodMs = this.periodToMs(period);
    const since = toSqliteTimestamp(new Date(now - periodMs));
    const groupExpr = this.periodToGroupBy(period);

    const rows = sqlite
      .prepare(
        `SELECT ${groupExpr} as bucket,
            AVG(cpu) as avg_cpu,
            AVG(memory_percent) as avg_mem,
            MAX(player_count) as max_players
          FROM metrics_history
          WHERE server_id = ? AND created_at >= ?
          GROUP BY bucket
          ORDER BY bucket ASC`
      )
      .all(serverId, since) as Array<{ bucket: string; avg_cpu: number; avg_mem: number; max_players: number }>;

    return rows.map((row) => ({
      timestamp: row.bucket,
      cpu: Math.round(row.avg_cpu * 100) / 100,
      memoryPercent: Math.round(row.avg_mem * 100) / 100,
      playerCount: row.max_players,
    }));
  }

  async getLatestEntries(serverId: string, limit: number): Promise<Array<AggregatedMetric>> {
    const rows = await db
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
    }));
  }

  private periodToMs(period: MetricsPeriod): number {
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

  private periodToGroupBy(period: MetricsPeriod): string {
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

  async shutdown() {
    if (this.sampleIntervalId) {
      clearInterval(this.sampleIntervalId);
      this.sampleIntervalId = null;
    }
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    console.log('Metrics history service shut down');
  }
}

export const metricsHistoryService = new MetricsHistoryService();
