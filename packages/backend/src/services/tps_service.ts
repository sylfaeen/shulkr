import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

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

    const result = await this.collectViaCommand(serverId);
    cache.set(serverId, { result, timestamp: Date.now() });
    return result;
  }

  private collectViaCommand(serverId: string): Promise<TpsResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve({ tps: null, mspt: null });
      }, COMMAND_TIMEOUT_MS);

      const listener = (event: { serverId: string; data: string }) => {
        if (event.serverId !== serverId) return;
        const clean = event.data.replace(MC_COLOR_REGEX, '');

        // Paper "mspt" format: "Server tick times (avg/min/max) from last 5s, 10s, 60s: 3.45/1.23/5.67, ..."
        const msptMatch = clean.match(/Server tick times.*?:\s*([\d.]+)/);
        if (msptMatch) {
          cleanup();
          const mspt = parseFloat(msptMatch[1]);
          if (isNaN(mspt)) {
            resolve({ tps: null, mspt: null });
          } else {
            const tps = Math.min(20, 1000 / mspt);
            resolve({ tps: Math.round(tps * 100) / 100, mspt: Math.round(mspt * 100) / 100 });
          }
          return;
        }

        // Spigot fallback: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
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
      // Use "mspt" instead of "tps" — Paper 1.21+ crashes on console "tps" (NPE: CommandSourceStack has no level)
      serverProcessManager.sendCommand(serverId, 'mspt');
    });
  }
}

export const tpsService = new TpsService();
