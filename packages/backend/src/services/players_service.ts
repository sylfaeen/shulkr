import { EventEmitter } from 'events';
import type { PlayersUpdate } from '@shulkr/shared';

// Regex patterns for Minecraft log parsing
// Vanilla/Paper: "[HH:MM:SS INFO]: PlayerName joined the game"
const JOIN_PATTERNS = [
  /^\[[\d:]+\s+INFO\]:\s+(\w+)\s+joined the game$/,
  /^\[[\d:]+\s+INFO\]:\s+(\w+)\[\/[\d.:]+\]\s+logged in/,
  /INFO\]:\s+(\w+)\s+joined the game/,
  /(\w+)\s+joined the game/,
];

// Vanilla/Paper: "[HH:MM:SS INFO]: PlayerName left the game"
const LEAVE_PATTERNS = [
  /^\[[\d:]+\s+INFO\]:\s+(\w+)\s+left the game$/,
  /^\[[\d:]+\s+INFO\]:\s+(\w+)\s+lost connection:/,
  /INFO\]:\s+(\w+)\s+left the game/,
  /(\w+)\s+left the game/,
  /(\w+)\s+lost connection:/,
];

class PlayersService extends EventEmitter {
  // Map of serverId -> Set of player names
  private serverPlayers: Map<string, Set<string>> = new Map();

  /**
   * Get current players for a server
   */
  getPlayers(serverId: string): Array<string> {
    const players = this.serverPlayers.get(serverId);
    return players ? Array.from(players) : [];
  }

  /**
   * Get player count for a server
   */
  getPlayerCount(serverId: string): number {
    const players = this.serverPlayers.get(serverId);
    return players ? players.size : 0;
  }

  /**
   * Parse a console log line and update player list if needed
   * Returns true if player list changed
   */
  parseLogLine(serverId: string, line: string): boolean {
    // Ensure we have a Set for this server
    if (!this.serverPlayers.has(serverId)) {
      this.serverPlayers.set(serverId, new Set());
    }

    const players = this.serverPlayers.get(serverId)!;
    const trimmedLine = line.trim();

    // Check for player join
    for (const pattern of JOIN_PATTERNS) {
      const match = trimmedLine.match(pattern);
      if (match && match[1]) {
        const playerName = match[1];
        if (!players.has(playerName)) {
          players.add(playerName);
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
          this.emitPlayersUpdate(serverId);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Clear all players for a server (called when server stops)
   */
  clearPlayers(serverId: string): void {
    const players = this.serverPlayers.get(serverId);
    if (players && players.size > 0) {
      players.clear();
      this.emitPlayersUpdate(serverId);
    }
  }

  /**
   * Remove server from tracking
   */
  removeServer(serverId: string): void {
    this.serverPlayers.delete(serverId);
  }

  /**
   * Emit players update event
   */
  private emitPlayersUpdate(serverId: string): void {
    const players = this.getPlayers(serverId);
    const update: PlayersUpdate = {
      server_id: serverId,
      players,
      count: players.length,
      timestamp: new Date().toISOString(),
    };
    this.emit('server:players', update);
  }
}

// Singleton instance
export const playersService = new PlayersService();
