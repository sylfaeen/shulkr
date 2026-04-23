import { lt } from 'drizzle-orm';
import { db, sqlite } from '@shulkr/backend/db';
import { gcEvents } from '@shulkr/backend/db/schema';

const RETENTION_DAYS = 30;

// G1 GC log pattern: "[GC pause (G1 Evacuation Pause) 512M->256M(1024M), 0.0234 secs]"
const G1_GC_REGEX = /GC\s+pause\s+\(([^)]+)\)\s+(\d+)M->(\d+)M\(\d+M\),?\s+([\d.]+)\s+secs/;
// Generic GC pattern: "GC(123) Pause ... 12.345ms"
const GENERIC_GC_REGEX = /GC\(\d+\)\s+Pause\s+(\w+).*?([\d.]+)ms/;
// ZGC / Shenandoah pattern
const ZGC_REGEX = /GC\(\d+\)\s+(Garbage Collection|Concurrent|Pause).*?([\d.]+)ms/;

interface GcSummary {
  totalPauses: number;
  totalDurationMs: number;
  maxDurationMs: number;
  points: Array<{ timestamp: string; durationMs: number; gcType: string }>;
}

class GcService {
  /**
   * Parse a console line for GC events. Called from server_process_manager stdout handler.
   */
  parseGcLine(serverId: string, line: string): void {
    const g1Match = line.match(G1_GC_REGEX);
    if (g1Match) {
      const durationMs = parseFloat(g1Match[4]) * 1000;
      db.insert(gcEvents)
        .values({
          server_id: serverId,
          gc_type: g1Match[1],
          duration_ms: Math.round(durationMs * 100) / 100,
          heap_before_mb: parseInt(g1Match[2]),
          heap_after_mb: parseInt(g1Match[3]),
        })
        .run();
      return;
    }
    const genericMatch = line.match(GENERIC_GC_REGEX);
    if (genericMatch) {
      db.insert(gcEvents)
        .values({
          server_id: serverId,
          gc_type: genericMatch[1],
          duration_ms: parseFloat(genericMatch[2]),
        })
        .run();
      return;
    }
    const zgcMatch = line.match(ZGC_REGEX);
    if (zgcMatch && zgcMatch[1] === 'Pause') {
      db.insert(gcEvents)
        .values({
          server_id: serverId,
          gc_type: 'ZGC',
          duration_ms: parseFloat(zgcMatch[2]),
        })
        .run();
    }
  }
  getSummary(serverId: string, periodHours: number): GcSummary {
    const since = new Date(Date.now() - periodHours * 3600_000).toISOString();
    const statsRow = sqlite
      .prepare(
        `SELECT COUNT(*) AS total_pauses,
                COALESCE(SUM(duration_ms), 0) AS total_duration,
                COALESCE(MAX(duration_ms), 0) AS max_duration
         FROM gc_events
         WHERE server_id = ? AND created_at >= ?`
      )
      .get(serverId, since) as { total_pauses: number; total_duration: number; max_duration: number };
    const points = sqlite
      .prepare(
        `SELECT created_at AS timestamp, duration_ms AS durationMs, gc_type AS gcType
         FROM gc_events
         WHERE server_id = ? AND created_at >= ?
         ORDER BY created_at ASC
         LIMIT 1000`
      )
      .all(serverId, since) as Array<{ timestamp: string; durationMs: number; gcType: string }>;
    return {
      totalPauses: statsRow.total_pauses,
      totalDurationMs: Math.round(statsRow.total_duration * 100) / 100,
      maxDurationMs: Math.round(statsRow.max_duration * 100) / 100,
      points,
    };
  }
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000).toISOString();
    await db.delete(gcEvents).where(lt(gcEvents.created_at, cutoff));
  }
}

export const gcService = new GcService();
