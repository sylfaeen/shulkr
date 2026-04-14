import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { sparkService } from '@shulkr/backend/services/spark_service';

const COMMAND_TIMEOUT_MS = 5_000;
const MC_COLOR_REGEX = /§[0-9a-fk-or]/g;

interface TpsResult {
  tps: number | null;
  mspt: number | null;
}

// Cache per server to avoid spamming commands
const cache = new Map<string, { result: TpsResult; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

class TpsService {
  async collect(serverId: string): Promise<TpsResult> {
    const cached = cache.get(serverId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }

    const isRunning = serverProcessManager.getStatus(serverId).status === 'running';
    if (!isRunning) return { tps: null, mspt: null };

    const hasSpark = await sparkService.isInstalled(serverId);
    const result = hasSpark ? await this.collectViaSpark(serverId) : await this.collectViaCommand(serverId);

    cache.set(serverId, { result, timestamp: Date.now() });
    return result;
  }

  private async collectViaSpark(serverId: string): Promise<TpsResult> {
    const health = await sparkService.getHealth(serverId);
    return { tps: health.tps ?? null, mspt: health.mspt ?? null };
  }

  private async collectViaCommand(serverId: string): Promise<TpsResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve({ tps: null, mspt: null });
      }, COMMAND_TIMEOUT_MS);

      const listener = (event: { serverId: string; data: string }) => {
        if (event.serverId !== serverId) return;
        const clean = event.data.replace(MC_COLOR_REGEX, '');

        // Paper/Spigot format: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
        const tpsMatch = clean.match(/TPS from last.*?:\s*([\d.]+)/);
        if (tpsMatch) {
          cleanup();
          const tps = parseFloat(tpsMatch[1]);
          resolve({ tps: isNaN(tps) ? null : tps, mspt: null });
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        serverProcessManager.removeListener('console:output', listener);
      };

      serverProcessManager.on('console:output', listener);
      serverProcessManager.sendCommand(serverId, 'tps');
    });
  }
}

export const tpsService = new TpsService();
