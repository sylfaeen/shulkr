import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { getAgentLive } from '@shulkr/backend/services/agent_ingest_service';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

const MC_COLOR_REGEX = /§[0-9a-fk-or]/g;
const POLL_INTERVAL_MS = 30_000;
const DATA_TTL_MS = 120_000;
const BOOT_GRACE_MS = 10_000;
const HEADER_EXPIRY_MS = 2_000;

export interface TpsResult {
  tps: number | null;
  mspt: number | null;
}

const latestData = new Map<string, { result: TpsResult; timestamp: number }>();
const pendingMsptHeader = new Map<string, number>();
const readyAt = new Map<string, number>();

let pollIntervalId: NodeJS.Timeout | null = null;

type Deps = Pick<AppDeps, 'clock'>;

function storeMspt(deps: Deps, serverId: string, mspt: number): void {
  const tps = mspt <= 0 ? 20 : Math.min(20, 1000 / mspt);
  latestData.set(serverId, {
    result: { tps: Math.round(tps * 100) / 100, mspt: Math.round(mspt * 100) / 100 },
    timestamp: deps.clock().getTime(),
  });
}

function parseTpsLine(deps: Deps, serverId: string, line: string): void {
  // eslint-disable-next-line no-control-regex
  const clean = line.replace(MC_COLOR_REGEX, '').replace(/\x1b\[[0-9;]*m/g, '');
  if (/Server tick times[^\n]*from last[^\n]*:\s*$/.test(clean)) {
    pendingMsptHeader.set(serverId, deps.clock().getTime());
    return;
  }

  const msptInline = clean.match(/Server tick times[^\n]*?:\s*([\d.]+)\s*\//);
  if (msptInline) {
    const mspt = parseFloat(msptInline[1]);
    if (!isNaN(mspt) && mspt >= 0) storeMspt(deps, serverId, mspt);
    return;
  }

  const headerTs = pendingMsptHeader.get(serverId);
  if (headerTs && deps.clock().getTime() - headerTs < HEADER_EXPIRY_MS) {
    const triplets = clean.match(/([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)\s*,\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/);
    if (triplets) {
      pendingMsptHeader.delete(serverId);
      const mspt = parseFloat(triplets[1]);
      if (!isNaN(mspt) && mspt >= 0) storeMspt(deps, serverId, mspt);
      return;
    }
  }

  const tickMatch = clean.match(/Tick durations.*?:\s*([\d.]+)\s*\/\s*([\d.]+)/);
  if (tickMatch) {
    const mspt = parseFloat(tickMatch[2]);
    if (!isNaN(mspt) && mspt >= 0) storeMspt(deps, serverId, mspt);
    return;
  }

  const tpsMatch = clean.match(/TPS from last[^\n]*?:[^\d]*\*?([\d.]+)/);
  if (tpsMatch) {
    const tps = parseFloat(tpsMatch[1]);
    if (!isNaN(tps)) {
      const existing = latestData.get(serverId);
      latestData.set(serverId, {
        result: { tps: Math.round(tps * 100) / 100, mspt: existing?.result.mspt ?? null },
        timestamp: deps.clock().getTime(),
      });
    }
  }
}

function pollAllServers(deps: Deps): void {
  const running = serverProcessManager.getRunningServers();
  if (running.length === 0) return;
  const now = deps.clock().getTime();
  for (const serverId of running) {
    if (getAgentLive(getAppDeps(), serverId) !== null) continue;
    const ready = readyAt.get(serverId);
    if (!ready || now - ready < BOOT_GRACE_MS) continue;
    const msptSent = serverProcessManager.sendCommand(serverId, 'mspt');
    const tpsSent = serverProcessManager.sendCommand(serverId, 'tps');
    if (!msptSent && !tpsSent) {
      console.warn(`[tps] failed to send tps/mspt to ${serverId} (stdin not writable?)`);
    }
  }
}

export function initializeTpsService(deps: Deps): void {
  serverProcessManager.on('console:output', (event: { serverId: string; data: string }) => {
    parseTpsLine(deps, event.serverId, event.data);
  });

  serverProcessManager.on('server:ready', (event: { serverId: string }) => {
    readyAt.set(event.serverId, deps.clock().getTime());
  });

  serverProcessManager.on('server:stopped', (event: { serverId: string }) => {
    readyAt.delete(event.serverId);
    latestData.delete(event.serverId);
    pendingMsptHeader.delete(event.serverId);
  });

  pollIntervalId = setInterval(() => pollAllServers(deps), POLL_INTERVAL_MS);
  pollIntervalId.unref();
}

export function shutdownTpsService(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

export function collectTps(deps: Deps, serverId: string): TpsResult {
  const live = getAgentLive(getAppDeps(), serverId);
  if (live && live.tps && live.mspt) {
    return {
      tps: Math.round(live.tps.avg1m * 100) / 100,
      mspt: Math.round(live.mspt.avg1m * 100) / 100,
    };
  }

  const entry = latestData.get(serverId);
  if (entry && deps.clock().getTime() - entry.timestamp < DATA_TTL_MS) {
    return entry.result;
  }
  return { tps: null, mspt: null };
}
