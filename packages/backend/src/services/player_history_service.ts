import { eq, and, isNull, lt, desc } from 'drizzle-orm';
import { db, sqlite } from '@shulkr/backend/db';
import { playerSessions } from '@shulkr/backend/db/schema';

const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 3_600_000;

class PlayerHistoryService {
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  initialize() {
    this.closeOrphanedSessions();
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
    console.log('Player history service initialized (30d retention)');
  }
  async recordJoin(serverId: string, playerName: string, uuid: string | null, ip: string | null): Promise<void> {
    await db.insert(playerSessions).values({
      server_id: serverId,
      player_name: playerName,
      player_uuid: uuid,
      ip_address: ip,
      joined_at: new Date().toISOString(),
    });
  }
  async recordLeave(serverId: string, playerName: string): Promise<void> {
    const [openSession] = await db
      .select()
      .from(playerSessions)
      .where(
        and(eq(playerSessions.server_id, serverId), eq(playerSessions.player_name, playerName), isNull(playerSessions.left_at))
      )
      .orderBy(desc(playerSessions.joined_at))
      .limit(1);
    if (openSession) {
      await db.update(playerSessions).set({ left_at: new Date().toISOString() }).where(eq(playerSessions.id, openSession.id));
    }
  }
  async closeAllSessions(serverId: string): Promise<void> {
    await db
      .update(playerSessions)
      .set({ left_at: new Date().toISOString() })
      .where(and(eq(playerSessions.server_id, serverId), isNull(playerSessions.left_at)));
  }
  queryHistory(
    serverId: string,
    limit: number,
    offset: number
  ): {
    sessions: Array<{
      id: number;
      playerName: string;
      playerUuid: string | null;
      ip: string | null;
      joinedAt: string;
      leftAt: string | null;
      durationMs: number | null;
    }>;
    total: number;
  } {
    const total = sqlite.prepare('SELECT COUNT(*) as count FROM player_sessions WHERE server_id = ?').get(serverId) as {
      count: number;
    };
    const rows = sqlite
      .prepare(
        `SELECT id, player_name, player_uuid, ip_address, joined_at, left_at
         FROM player_sessions
         WHERE server_id = ?
         ORDER BY joined_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(serverId, limit, offset) as Array<{
      id: number;
      player_name: string;
      player_uuid: string | null;
      ip_address: string | null;
      joined_at: string;
      left_at: string | null;
    }>;
    return {
      sessions: rows.map((r) => ({
        id: r.id,
        playerName: r.player_name,
        playerUuid: r.player_uuid,
        ip: r.ip_address,
        joinedAt: r.joined_at,
        leftAt: r.left_at,
        durationMs: r.left_at ? new Date(r.left_at).getTime() - new Date(r.joined_at).getTime() : null,
      })),
      total: total.count,
    };
  }
  private async closeOrphanedSessions(): Promise<void> {
    const result = await db
      .update(playerSessions)
      .set({ left_at: new Date().toISOString() })
      .where(isNull(playerSessions.left_at));
    if (result.changes > 0) {
      console.log(`Player history: closed ${result.changes} orphaned session(s)`);
    }
  }
  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    const result = await db.delete(playerSessions).where(lt(playerSessions.created_at, cutoff));
    if (result.changes > 0) {
      console.log(`Player history: cleaned up ${result.changes} sessions older than ${RETENTION_DAYS} days`);
    }
  }
  shutdown(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

export const playerHistoryService = new PlayerHistoryService();
