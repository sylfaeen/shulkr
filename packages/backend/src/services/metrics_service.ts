import pidusage from 'pidusage';
import os from 'os';
import type { ServerMetrics } from '@shulkr/shared';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { type AppDeps } from '@shulkr/backend/deps';

const CACHE_TTL_MS = 2000;

type CachedMetrics = {
  data: ServerMetrics;
  expiresAt: number;
};

type Deps = Pick<AppDeps, 'clock'>;

// Module-level cache shared across requests (per-process). System info is constant per process, captured once below.
const TOTAL_MEMORY = os.totalmem();
const CPU_COUNT = os.cpus().length || 1;
const cache = new Map<string, CachedMetrics>();

export async function getServerMetrics(deps: Deps, serverId: string): Promise<ServerMetrics | null> {
  const { status, pid, uptime } = serverProcessManager.getStatus(serverId);
  if (status !== 'running' || pid === null) return null;

  const now = deps.clock().getTime();
  const cached = cache.get(serverId);
  if (cached && now < cached.expiresAt) {
    return { ...cached.data, uptime: uptime ?? 0 };
  }

  try {
    const stats = await pidusage(pid);
    const cpuRaw = Math.round(stats.cpu * 100) / 100;
    const metrics: ServerMetrics = {
      cpu: Math.round((stats.cpu / CPU_COUNT) * 100) / 100,
      cpu_raw: cpuRaw,
      cpu_cores: CPU_COUNT,
      memory: stats.memory,
      memory_total: TOTAL_MEMORY,
      memory_percent: Math.round((stats.memory / TOTAL_MEMORY) * 10000) / 100,
      uptime: uptime ?? 0,
      timestamp: deps.clock().toISOString(),
    };
    cache.set(serverId, { data: metrics, expiresAt: now + CACHE_TTL_MS });
    return metrics;
  } catch {
    return null;
  }
}

export function invalidateMetricsCache(serverId: string): void {
  cache.delete(serverId);
}

export function isServerRunning(serverId: string): boolean {
  return serverProcessManager.getStatus(serverId).status === 'running';
}
