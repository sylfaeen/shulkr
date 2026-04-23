import { eq, and, desc, count } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { db, sqlite } from '@shulkr/backend/db';
import { playerSessions } from '@shulkr/backend/db/schema';
import { playersService } from '@shulkr/backend/services/players_service';
import { serverService } from '@shulkr/backend/services/server_service';

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

function readUuidFromUserCache(serverPath: string, playerName: string): string | null {
  try {
    const cachePath = path.join(serverPath, 'usercache.json');
    if (!fs.existsSync(cachePath)) return null;
    const content = fs.readFileSync(cachePath, 'utf-8');
    const entries = JSON.parse(content) as Array<UserCacheEntry>;
    const match = entries.find((entry) => entry.name?.toLowerCase() === playerName.toLowerCase());
    return match?.uuid ?? null;
  } catch {
    return null;
  }
}

class PlayerProfileService {
  async getProfile(serverId: string, playerName: string) {
    const row = sqlite
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
    // Backfill missing UUID from usercache.json (common for Bedrock players
    // joined before the regex fix landed — their sessions were recorded with
    // player_uuid = NULL because the "UUID of player" log line was stripped of
    // the leading dot and stored under a different key in pendingUuids).
    if (!row.player_uuid) {
      const server = await serverService.getServerById(serverId);
      if (server) {
        const uuid = readUuidFromUserCache(server.path, row.player_name);
        if (uuid) {
          row.player_uuid = uuid;
          sqlite
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
  async getSessions(serverId: string, playerName: string, limit = 50, offset = 0) {
    const [totalResult] = await db
      .select({ value: count() })
      .from(playerSessions)
      .where(and(eq(playerSessions.server_id, serverId), eq(playerSessions.player_name, playerName)));
    const rows = await db
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
        return {
          id: s.id,
          joinedAt: s.joined_at,
          leftAt: s.left_at,
          durationMinutes: duration,
        };
      }),
      total: totalResult.value,
    };
  }
  async getModeration(serverId: string, playerName: string) {
    const server = await serverService.getServerById(serverId);
    if (!server) return { banned: false, banReason: null, banDate: null, banSource: null, banExpires: null };
    const bannedPlayersPath = path.join(server.path, 'banned-players.json');
    try {
      if (!fs.existsSync(bannedPlayersPath)) {
        return { banned: false, banReason: null, banDate: null, banSource: null, banExpires: null };
      }
      const content = fs.readFileSync(bannedPlayersPath, 'utf-8');
      const bans: Array<BanEntry> = JSON.parse(content);
      const ban = bans.find((b) => b.name.toLowerCase() === playerName.toLowerCase());
      if (!ban) {
        return { banned: false, banReason: null, banDate: null, banSource: null, banExpires: null };
      }
      return {
        banned: true,
        banReason: ban.reason || null,
        banDate: ban.created || null,
        banSource: ban.source || null,
        banExpires: ban.expires === 'forever' ? null : ban.expires,
      };
    } catch {
      return { banned: false, banReason: null, banDate: null, banSource: null, banExpires: null };
    }
  }
  async search(serverId: string, query: string) {
    const rows = sqlite
      .prepare(
        `SELECT player_name, player_uuid, MAX(COALESCE(left_at, joined_at)) AS last_seen
         FROM player_sessions
         WHERE server_id = ? AND player_name LIKE ? COLLATE NOCASE
         GROUP BY player_name
         ORDER BY last_seen DESC
         LIMIT 20`
      )
      .all(serverId, `%${query}%`) as Array<{ player_name: string; player_uuid: string | null; last_seen: string }>;
    return rows.map((r) => ({
      name: r.player_name,
      uuid: r.player_uuid,
      lastSeen: r.last_seen,
    }));
  }
}

export const playerProfileService = new PlayerProfileService();
