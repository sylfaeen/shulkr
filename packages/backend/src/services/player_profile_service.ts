import { eq, and, desc, count } from 'drizzle-orm';
import { join } from 'node:path';
import { playerSessions } from '@shulkr/backend/db/schema';
import { playersService } from '@shulkr/backend/services/players_service';
import { getServerById } from '@shulkr/backend/services/server_service';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

interface BanEntry {
  uuid: string;
  name: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

interface UserCacheEntry {
  name: string;
  uuid: string;
  expiresOn?: string;
}

type Deps = Pick<AppDeps, 'db' | 'sqlite' | 'fs'>;

async function readUuidFromUserCache(deps: Deps, serverPath: string, playerName: string): Promise<string | null> {
  try {
    const cachePath = join(serverPath, 'usercache.json');
    if (!(await deps.fs.exists(cachePath))) return null;
    const content = await deps.fs.readFileText(cachePath);
    const entries = JSON.parse(content) as Array<UserCacheEntry>;
    const match = entries.find((entry) => entry.name?.toLowerCase() === playerName.toLowerCase());
    return match?.uuid ?? null;
  } catch {
    return null;
  }
}

export async function getPlayerProfile(deps: Deps, serverId: string, playerName: string) {
  const row = deps.sqlite
    .prepare(
      `SELECT
         player_name,
         player_uuid,
         MIN(joined_at) AS first_seen,
         MAX(COALESCE(left_at, joined_at)) AS last_seen,
         COUNT(*) AS session_count,
         COALESCE(SUM(
           CASE WHEN left_at IS NOT NULL
             THEN (julianday(left_at) - julianday(joined_at)) * 1440
             ELSE 0
           END
         ), 0) AS total_playtime
       FROM player_sessions
       WHERE server_id = ? AND player_name = ? COLLATE NOCASE
       GROUP BY player_name`
    )
    .get(serverId, playerName) as
    | {
        player_name: string;
        player_uuid: string | null;
        first_seen: string;
        last_seen: string;
        session_count: number;
        total_playtime: number;
      }
    | undefined;
  if (!row) return null;

  // Backfill missing UUID from usercache.json (Bedrock players, leading-dot bug).
  if (!row.player_uuid) {
    const server = await getServerById(getAppDeps(), serverId);
    if (server) {
      const uuid = await readUuidFromUserCache(deps, server.path, row.player_name);
      if (uuid) {
        row.player_uuid = uuid;
        deps.sqlite
          .prepare(
            `UPDATE player_sessions
             SET player_uuid = ?
             WHERE server_id = ? AND player_name = ? COLLATE NOCASE AND player_uuid IS NULL`
          )
          .run(uuid, serverId, row.player_name);
      }
    }
  }

  const online = playersService.getPlayers(serverId).includes(row.player_name);
  const avatarUrl = row.player_uuid ? `/api/players/${row.player_uuid}/avatar?size=64` : null;
  return {
    name: row.player_name,
    uuid: row.player_uuid,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    totalPlaytimeMinutes: Math.round(row.total_playtime * 10) / 10,
    sessionCount: row.session_count,
    avatarUrl,
    online,
  };
}

export async function getPlayerSessions(deps: Deps, serverId: string, playerName: string, limit = 50, offset = 0) {
  const [totalResult] = await deps.db
    .select({ value: count() })
    .from(playerSessions)
    .where(and(eq(playerSessions.server_id, serverId), eq(playerSessions.player_name, playerName)));

  const rows = await deps.db
    .select()
    .from(playerSessions)
    .where(and(eq(playerSessions.server_id, serverId), eq(playerSessions.player_name, playerName)))
    .orderBy(desc(playerSessions.joined_at))
    .limit(limit)
    .offset(offset);

  return {
    sessions: rows.map((s) => {
      const duration =
        s.left_at && s.joined_at
          ? Math.round(((new Date(s.left_at).getTime() - new Date(s.joined_at).getTime()) / 60_000) * 10) / 10
          : null;
      return { id: s.id, joinedAt: s.joined_at, leftAt: s.left_at, durationMinutes: duration };
    }),
    total: totalResult.value,
  };
}

export async function getPlayerModeration(deps: Deps, serverId: string, playerName: string) {
  const server = await getServerById(getAppDeps(), serverId);
  const empty = { banned: false, banReason: null, banDate: null, banSource: null, banExpires: null };
  if (!server) return empty;

  const bannedPlayersPath = join(server.path, 'banned-players.json');
  try {
    if (!(await deps.fs.exists(bannedPlayersPath))) return empty;
    const content = await deps.fs.readFileText(bannedPlayersPath);
    const bans: Array<BanEntry> = JSON.parse(content);
    const ban = bans.find((b) => b.name.toLowerCase() === playerName.toLowerCase());
    if (!ban) return empty;
    return {
      banned: true,
      banReason: ban.reason || null,
      banDate: ban.created || null,
      banSource: ban.source || null,
      banExpires: ban.expires === 'forever' ? null : ban.expires,
    };
  } catch {
    return empty;
  }
}

export async function searchPlayers(deps: Deps, serverId: string, query: string) {
  const rows = deps.sqlite
    .prepare(
      `SELECT player_name, player_uuid, MAX(COALESCE(left_at, joined_at)) AS last_seen
       FROM player_sessions
       WHERE server_id = ? AND player_name LIKE ? COLLATE NOCASE
       GROUP BY player_name
       ORDER BY last_seen DESC
       LIMIT 20`
    )
    .all(serverId, `%${query}%`) as Array<{ player_name: string; player_uuid: string | null; last_seen: string }>;
  return rows.map((r) => ({ name: r.player_name, uuid: r.player_uuid, lastSeen: r.last_seen }));
}
