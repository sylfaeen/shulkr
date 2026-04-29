import { eq, and, isNull, lt, desc } from 'drizzle-orm';
import { playerSessions } from '@shulkr/backend/db/schema';
import { type AppDeps } from '@shulkr/backend/deps';

const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 3_600_000;

type Deps = Pick<AppDeps, 'db' | 'sqlite' | 'clock'>;

let cleanupIntervalId: NodeJS.Timeout | null = null;

export async function recordPlayerJoin(
  deps: Deps,
  serverId: string,
  playerName: string,
  uuid: string | null,
  ip: string | null
): Promise<void> {
  await deps.db.insert(playerSessions).values({
    server_id: serverId,
    player_name: playerName,
    player_uuid: uuid,
    ip_address: ip,
    joined_at: deps.clock().toISOString(),
  });
}

export async function recordPlayerLeave(deps: Deps, serverId: string, playerName: string): Promise<void> {
  const [openSession] = await deps.db
    .select()
    .from(playerSessions)
    .where(
      and(eq(playerSessions.server_id, serverId), eq(playerSessions.player_name, playerName), isNull(playerSessions.left_at))
    )
    .orderBy(desc(playerSessions.joined_at))
    .limit(1);

  if (openSession) {
    await deps.db
      .update(playerSessions)
      .set({ left_at: deps.clock().toISOString() })
      .where(eq(playerSessions.id, openSession.id));
  }
}

export async function closeAllPlayerSessions(deps: Deps, serverId: string): Promise<void> {
  await deps.db
    .update(playerSessions)
    .set({ left_at: deps.clock().toISOString() })
    .where(and(eq(playerSessions.server_id, serverId), isNull(playerSessions.left_at)));
}

export function queryPlayerHistory(deps: Deps, serverId: string, limit: number, offset: number) {
  const total = deps.sqlite.prepare('SELECT COUNT(*) as count FROM player_sessions WHERE server_id = ?').get(serverId) as {
    count: number;
  };

  const rows = deps.sqlite
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

async function closeOrphanedPlayerSessions(deps: Deps): Promise<void> {
  const result = await deps.db
    .update(playerSessions)
    .set({ left_at: deps.clock().toISOString() })
    .where(isNull(playerSessions.left_at));

  if (result.changes > 0) {
    console.log(`Player history: closed ${result.changes} orphaned session(s)`);
  }
}

async function cleanupPlayerHistory(deps: Deps): Promise<void> {
  const cutoff = new Date(deps.clock().getTime() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const result = await deps.db.delete(playerSessions).where(lt(playerSessions.created_at, cutoff));

  if (result.changes > 0) {
    console.log(`Player history: cleaned up ${result.changes} sessions older than ${RETENTION_DAYS} days`);
  }
}

export function initializePlayerHistory(deps: Deps): void {
  void closeOrphanedPlayerSessions(deps);
  cleanupIntervalId = setInterval(() => {
    void cleanupPlayerHistory(deps);
  }, CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref();
  console.log('Player history service initialized (30d retention)');
}

export function shutdownPlayerHistory(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}
