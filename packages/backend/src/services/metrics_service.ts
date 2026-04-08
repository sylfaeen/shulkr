import pidusage from 'pidusage';
import os from 'os';
import type { ServerMetrics } from '@shulkr/shared';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

class MetricsService {
  private readonly totalMemory: number;
  private readonly cpuCount: number;

  constructor() {
    this.totalMemory = os.totalmem();
    this.cpuCount = os.cpus().length || 1;
  }

  async getServerMetrics(serverId: string): Promise<ServerMetrics | null> {
    const { status, pid, uptime } = serverProcessManager.getStatus(serverId);

    if (status !== 'running' || pid === null) {
      return null;
    }

    try {
      const stats = await pidusage(pid);

      const cpuRaw = Math.round(stats.cpu * 100) / 100;

      return {
        cpu: Math.round((stats.cpu / this.cpuCount) * 100) / 100,
        cpu_raw: cpuRaw,
        cpu_cores: this.cpuCount,
        memory: stats.memory,
        memory_total: this.totalMemory,
        memory_percent: Math.round((stats.memory / this.totalMemory) * 10000) / 100,
        uptime: uptime ?? 0,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  isServerRunning(serverId: string): boolean {
    const { status } = serverProcessManager.getStatus(serverId);
    return status === 'running';
  }
}

export const metricsService = new MetricsService();
