import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

const MC_COLOR_REGEX = /§[0-9a-fk-or]/g;

interface TpsResult {
  tps: number | null;
  mspt: number | null;
}

// Stores the latest TPS/MSPT values parsed from console output
const latestData = new Map<string, { result: TpsResult; timestamp: number }>();
const DATA_TTL_MS = 120_000;

class TpsService {
  initialize() {
    serverProcessManager.on('console:output', (event: { serverId: string; data: string }) => {
      this.parseConsoleLine(event.serverId, event.data);
    });
  }
  collect(serverId: string): TpsResult {
    const entry = latestData.get(serverId);
    if (entry && Date.now() - entry.timestamp < DATA_TTL_MS) {
      return entry.result;
    }
    return { tps: null, mspt: null };
  }
  private parseConsoleLine(serverId: string, line: string): void {
    const clean = line.replace(MC_COLOR_REGEX, '');
    // Paper "mspt" command output: "Server tick times (avg/min/max) from last 5s, 10s, 60s: 3.45/1.23/5.67, ..."
    const msptMatch = clean.match(/Server tick times.*?:\s*([\d.]+)/);
    if (msptMatch) {
      const mspt = parseFloat(msptMatch[1]);
      if (!isNaN(mspt)) {
        const tps = Math.min(20, 1000 / mspt);
        latestData.set(serverId, {
          result: { tps: Math.round(tps * 100) / 100, mspt: Math.round(mspt * 100) / 100 },
          timestamp: Date.now(),
        });
      }
      return;
    }
    // Spark integrated health: "Tick durations (min/med/95%ile/max ms) from last 10s, 1m: 0.3/0.6/1.3/15.2; ..."
    const tickMatch = clean.match(/Tick durations.*?:\s*([\d.]+)\/([\d.]+)/);
    if (tickMatch) {
      const mspt = parseFloat(tickMatch[2]); // median
      if (!isNaN(mspt)) {
        const tps = Math.min(20, 1000 / mspt);
        latestData.set(serverId, {
          result: { tps: Math.round(tps * 100) / 100, mspt: Math.round(mspt * 100) / 100 },
          timestamp: Date.now(),
        });
      }
      return;
    }
    // Spigot/Paper TPS line: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
    // or Spark: "TPS from last 5s, 10s, 1m, 5m, 15m: *20.0, *20.0, ..."
    const tpsMatch = clean.match(/TPS from last.*?:\s*\*?([\d.]+)/);
    if (tpsMatch) {
      const tps = parseFloat(tpsMatch[1]);
      if (!isNaN(tps)) {
        const existing = latestData.get(serverId);
        latestData.set(serverId, {
          result: { tps: Math.round(tps * 100) / 100, mspt: existing?.result.mspt ?? null },
          timestamp: Date.now(),
        });
      }
    }
  }
}

export const tpsService = new TpsService();
