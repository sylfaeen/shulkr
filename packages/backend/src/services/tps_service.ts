import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { agentIngestService } from '@shulkr/backend/services/agent_ingest_service';

const MC_COLOR_REGEX = /§[0-9a-fk-or]/g;
const POLL_INTERVAL_MS = 30_000;
const DATA_TTL_MS = 120_000;
// Grace period after a server reports "Done" before we start polling commands.
// Paper 1.21+ rejects console commands with NPE if the CommandSourceStack has no
// ServerLevel yet, which happens briefly right after "Done".
const BOOT_GRACE_MS = 10_000;

interface TpsResult {
  tps: number | null;
  mspt: number | null;
}

// Stores the latest TPS/MSPT values parsed from console output
const latestData = new Map<string, { result: TpsResult; timestamp: number }>();
// Tracks per-server "we just saw the mspt header, expect the data line next"
const pendingMsptHeader = new Map<string, number>();
const HEADER_EXPIRY_MS = 2_000;
// Tracks per-server "Done" timestamp (0 = not ready yet, we shouldn't poll commands)
const readyAt = new Map<string, number>();

class TpsService {
  private pollIntervalId: NodeJS.Timeout | null = null;
  initialize() {
    serverProcessManager.on('console:output', (event: { serverId: string; data: string }) => {
      this.parseConsoleLine(event.serverId, event.data);
    });
    serverProcessManager.on('server:ready', (event: { serverId: string }) => {
      readyAt.set(event.serverId, Date.now());
    });
    serverProcessManager.on('server:stopped', (event: { serverId: string }) => {
      readyAt.delete(event.serverId);
      latestData.delete(event.serverId);
      pendingMsptHeader.delete(event.serverId);
    });
    // Periodically ask running servers for their TPS/MSPT
    this.pollIntervalId = setInterval(() => this.pollAllServers(), POLL_INTERVAL_MS);
  }
  shutdown() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
  private pollAllServers() {
    const running = serverProcessManager.getRunningServers();
    if (running.length === 0) return;
    const now = Date.now();
    for (const serverId of running) {
      // Skip if the shulkr-core plugin is actively pushing — its data is more accurate
      // and polling console would just add noise (and a /tps command echo every 30s).
      if (agentIngestService.getLive(serverId) !== null) continue;
      // Skip servers that haven't emitted "Done" yet, or are still within the
      // boot grace period. Paper 1.21+ NPEs on /tps and /mspt if run too early.
      const ready = readyAt.get(serverId);
      if (!ready || now - ready < BOOT_GRACE_MS) continue;
      // `mspt` on Paper outputs both MSPT and derived TPS
      // `tps` is a broader fallback (Paper + Spigot)
      const msptSent = serverProcessManager.sendCommand(serverId, 'mspt');
      const tpsSent = serverProcessManager.sendCommand(serverId, 'tps');
      if (!msptSent && !tpsSent) {
        console.warn(`[tps] failed to send tps/mspt to ${serverId} (stdin not writable?)`);
      }
    }
  }
  collect(serverId: string): TpsResult {
    // Prefer plugin data when fresh — it's the verified source and avoids console parsing.
    const live = agentIngestService.getLive(serverId);
    if (live && live.tps && live.mspt) {
      return {
        tps: Math.round(live.tps.avg1m * 100) / 100,
        mspt: Math.round(live.mspt.avg1m * 100) / 100,
      };
    }
    const entry = latestData.get(serverId);
    if (entry && Date.now() - entry.timestamp < DATA_TTL_MS) {
      return entry.result;
    }
    return { tps: null, mspt: null };
  }
  private parseConsoleLine(serverId: string, line: string): void {
    // eslint-disable-next-line no-control-regex
    const clean = line.replace(MC_COLOR_REGEX, '').replace(/\x1b\[[0-9;]*m/g, '');
    if (/Server tick times[^\n]*from last[^\n]*:\s*$/.test(clean)) {
      pendingMsptHeader.set(serverId, Date.now());
      return;
    }
    // Paper legacy "mspt" single-line: "Server tick times ... : 3.45/1.23/5.67, ..."
    const msptInline = clean.match(/Server tick times[^\n]*?:\s*([\d.]+)\s*\//);
    if (msptInline) {
      const mspt = parseFloat(msptInline[1]);
      if (!isNaN(mspt) && mspt >= 0) this.storeMspt(serverId, mspt);
      return;
    }
    // Paper modern mspt data line (follows the header): "◴ 0.0/0.0/0.2, 0.1/0.0/19.4, 0.1/0.0/19.4"
    const headerTs = pendingMsptHeader.get(serverId);
    if (headerTs && Date.now() - headerTs < HEADER_EXPIRY_MS) {
      const triplets = clean.match(/([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)\s*,\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/);
      if (triplets) {
        pendingMsptHeader.delete(serverId);
        const mspt = parseFloat(triplets[1]); // 5s avg
        if (!isNaN(mspt) && mspt >= 0) this.storeMspt(serverId, mspt);
        return;
      }
    }
    // Spark integrated health: "Tick durations (min/med/95%ile/max ms) from last 10s, 1m: 0.3/0.6/1.3/15.2; ..."
    const tickMatch = clean.match(/Tick durations.*?:\s*([\d.]+)\s*\/\s*([\d.]+)/);
    if (tickMatch) {
      const mspt = parseFloat(tickMatch[2]); // median
      if (!isNaN(mspt) && mspt >= 0) this.storeMspt(serverId, mspt);
      return;
    }
    // Spigot/Paper TPS line: "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
    // Paper modern may prefix values with "◴" or color codes — skip any non-digit before the first number.
    const tpsMatch = clean.match(/TPS from last[^\n]*?:[^\d]*\*?([\d.]+)/);
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
  private storeMspt(serverId: string, mspt: number) {
    const tps = mspt <= 0 ? 20 : Math.min(20, 1000 / mspt);
    latestData.set(serverId, {
      result: { tps: Math.round(tps * 100) / 100, mspt: Math.round(mspt * 100) / 100 },
      timestamp: Date.now(),
    });
  }
}

export const tpsService = new TpsService();
