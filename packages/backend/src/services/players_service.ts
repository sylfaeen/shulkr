import { EventEmitter } from 'events';
import type { PlayerInfo, PlayersUpdate } from '@shulkr/shared';
import { playerHistoryService } from '@shulkr/backend/services/player_history_service';
import { webhookService } from '@shulkr/backend/services/webhook_service';

// Player names can contain letters, digits, underscores, and a leading dot
// (Bedrock players routed through Geyser/Floodgate are commonly prefixed with `.`).
// We cannot use a plain `\w+` because it would strip the leading dot and store
// the Bedrock player under a different name than the one shown everywhere else
// (whitelist.json, ops.json, banned-players.json all preserve the dot).
const NAME = '[\\w.]+';

// Join patterns: capture player name and optionally IP
const JOIN_PATTERNS = [
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\[\\/([0-9.]+):\\d+\\]\\s+logged in`),
  new RegExp(`(${NAME})\\[\\/([0-9.]+):\\d+\\]\\s+logged in`),
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+joined the game$`),
  new RegExp(`INFO\\]:\\s+(${NAME})\\s+joined the game`),
  new RegExp(`(${NAME})\\s+joined the game`),
];

// Leave patterns
const LEAVE_PATTERNS = [
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+left the game$`),
  new RegExp(`^\\[[\\d:]+\\s+INFO\\]:\\s+(${NAME})\\s+lost connection:`),
  new RegExp(`INFO\\]:\\s+(${NAME})\\s+left the game`),
  new RegExp(`(${NAME})\\s+left the game`),
  new RegExp(`(${NAME})\\s+lost connection:`),
];

// UUID pattern: "UUID of player PlayerName is xxx-xxx-xxx"
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
    // Check for UUID assignment (comes before join)
    const uuidMatch = trimmedLine.match(UUID_PATTERN);
    if (uuidMatch && uuidMatch[1] && uuidMatch[2]) {
      const existing = players.get(uuidMatch[1]);
      if (existing) {
        existing.uuid = uuidMatch[2];
      } else {
        this.pendingUuids.set(uuidMatch[1], uuidMatch[2]);
      }
      // Don't return: continue checking for join/leave on the same line
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
            joinedAt: Date.now(),
          });
          playerHistoryService.recordJoin(serverId, playerName, uuid, ip);
          webhookService.dispatch(serverId, 'player:join', { playerName }).catch(() => {});
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
          playerHistoryService.recordLeave(serverId, playerName);
          webhookService.dispatch(serverId, 'player:leave', { playerName }).catch(() => {});
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
      playerHistoryService.closeAllSessions(serverId);
      this.emitPlayersUpdate(serverId);
    }
  }
  removeServer(serverId: string): void {
    this.serverPlayers.delete(serverId);
  }
  private emitPlayersUpdate(serverId: string): void {
    const players = this.getPlayers(serverId);
    const playerDetails = this.getPlayerDetails(serverId);
    const update: PlayersUpdate = {
      server_id: serverId,
      players,
      playerDetails,
      count: players.length,
      timestamp: new Date().toISOString(),
    };
    this.emit('server:players', update);
  }
}

export const playersService = new PlayersService();
