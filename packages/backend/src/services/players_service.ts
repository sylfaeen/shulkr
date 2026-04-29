import { EventEmitter } from 'events';
import type { PlayerInfo, PlayersUpdate } from '@shulkr/shared';
import { closeAllPlayerSessions, recordPlayerJoin, recordPlayerLeave } from '@shulkr/backend/services/player_history_service';
import { dispatchWebhooks } from '@shulkr/backend/services/webhook_service';
import { createClock } from '@shulkr/backend/deps/clock';
import { getAppDeps } from '@shulkr/backend/deps';

// Story 58.6.3: pragmatic migration, class + EventEmitter preserved (the public API is `playersService.on('server:players', …)` consumed by 6+ callsites). clock().getTime() / clock() are routed through a module-level clock from deps/clock.ts so the lint warnings drop to 0 on this file.
const clock = createClock();

// Player names can contain letters, digits, underscores, and a leading dot (Bedrock players routed through Geyser/Floodgate are commonly prefixed with `.`). We cannot use a plain `\w+` because it would strip the leading dot and store the Bedrock player under a different name than the one shown everywhere else (whitelist.json, ops.json, banned-players.json all preserve the dot).
const NAME = '[\\w.]+';

const JOIN_PATTERNS = [
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\[\\/([0-9.]+):\\d+\\]\\s+logged in`),
  new RegExp(`(${NAME})\\[\\/([0-9.]+):\\d+\\]\\s+logged in`),
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+joined the game$`),
  new RegExp(`INFO\\]:\\s+(${NAME})\\s+joined the game`),
  new RegExp(`(${NAME})\\s+joined the game`),
];

const LEAVE_PATTERNS = [
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+left the game$`),
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+lost connection:`),
  new RegExp(`INFO\\]:\\s+(${NAME})\\s+left the game`),
  new RegExp(`(${NAME})\\s+left the game`),
  new RegExp(`(${NAME})\\s+lost connection:`),
];

const UUID_PATTERN = new RegExp(`UUID of player (${NAME}) is ([0-9a-f-]+)`);

class PlayersService extends EventEmitter {
  private serverPlayers: Map<string, Map<string, PlayerInfo>> = new Map();
  private pendingUuids: Map<string, string> = new Map();
  getPlayers(serverId: string): Array<string> {
    const players = this.serverPlayers.get(serverId);
    return players ? Array.from(players.keys()) : [];
  }

  getPlayerDetails(serverId: string): Array<PlayerInfo> {
    const players = this.serverPlayers.get(serverId);
    return players ? Array.from(players.values()) : [];
  }

  getPlayerCount(serverId: string): number {
    const players = this.serverPlayers.get(serverId);
    return players ? players.size : 0;
  }

  parseLogLine(serverId: string, line: string): boolean {
    if (!this.serverPlayers.has(serverId)) {
      this.serverPlayers.set(serverId, new Map());
    }
    const players = this.serverPlayers.get(serverId)!;
    const trimmedLine = line.trim();
    const uuidMatch = trimmedLine.match(UUID_PATTERN);

    if (uuidMatch && uuidMatch[1] && uuidMatch[2]) {
      const existing = players.get(uuidMatch[1]);
      if (existing) {
        existing.uuid = uuidMatch[2];
      } else {
        this.pendingUuids.set(uuidMatch[1], uuidMatch[2]);
      }
    }

    // Check for player join
    for (const pattern of JOIN_PATTERNS) {
      const match = trimmedLine.match(pattern);
      if (match && match[1]) {
        const playerName = match[1];
        const ip = match[2] || null;
        if (!players.has(playerName)) {
          const uuid = this.pendingUuids.get(playerName) ?? null;
          this.pendingUuids.delete(playerName);
          players.set(playerName, {
            name: playerName,
            uuid,
            ip,
            joinedAt: clock().getTime(),
            ping: null,
            health: null,
            food: null,
            world: null,
            x: null,
            y: null,
            z: null,
            op: null,
          });
          recordPlayerJoin(getAppDeps(), serverId, playerName, uuid, ip).then();
          dispatchWebhooks(getAppDeps(), serverId, 'player:join', { playerName }).catch(() => {});
          this.emitPlayersUpdate(serverId);
          return true;
        }
      }
    }

    // Check for player leave
    for (const pattern of LEAVE_PATTERNS) {
      const match = trimmedLine.match(pattern);
      if (match && match[1]) {
        const playerName = match[1];
        if (players.has(playerName)) {
          players.delete(playerName);
          recordPlayerLeave(getAppDeps(), serverId, playerName).then();
          dispatchWebhooks(getAppDeps(), serverId, 'player:leave', { playerName }).catch(() => {});
          this.emitPlayersUpdate(serverId);
          return true;
        }
      }
    }
    return false;
  }

  clearPlayers(serverId: string): void {
    const players = this.serverPlayers.get(serverId);
    if (players && players.size > 0) {
      players.clear();
      closeAllPlayerSessions(getAppDeps(), serverId).then();
      this.emitPlayersUpdate(serverId);
    }
  }

  removeServer(serverId: string): void {
    this.serverPlayers.delete(serverId);
  }

  updateLiveState(
    serverId: string,
    snapshots: Array<{
      name: string;
      ping?: number | null;
      health?: number | null;
      food?: number | null;
      world?: string | null;
      x?: number | null;
      y?: number | null;
      z?: number | null;
      op?: boolean | null;
    }>
  ): void {
    const players = this.serverPlayers.get(serverId);
    if (!players) return;

    let changed = false;
    for (const s of snapshots) {
      const existing = players.get(s.name);
      if (!existing) continue;
      const next: PlayerInfo = {
        ...existing,
        ping: s.ping ?? existing.ping,
        health: s.health ?? existing.health,
        food: s.food ?? existing.food,
        world: s.world ?? existing.world,
        x: s.x ?? existing.x,
        y: s.y ?? existing.y,
        z: s.z ?? existing.z,
        op: s.op ?? existing.op,
      };
      if (
        next.ping !== existing.ping ||
        next.health !== existing.health ||
        next.food !== existing.food ||
        next.world !== existing.world ||
        next.x !== existing.x ||
        next.y !== existing.y ||
        next.z !== existing.z ||
        next.op !== existing.op
      ) {
        players.set(s.name, next);
        changed = true;
      }
    }

    if (changed) this.emitPlayersUpdate(serverId);
  }

  private emitPlayersUpdate(serverId: string): void {
    const players = this.getPlayers(serverId);
    const playerDetails = this.getPlayerDetails(serverId);
    const update: PlayersUpdate = {
      server_id: serverId,
      players,
      playerDetails,
      count: players.length,
      timestamp: clock().toISOString(),
    };
    this.emit('server:players', update);
  }
}

export const playersService = new PlayersService();
