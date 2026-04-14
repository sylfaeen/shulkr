import { db, sqlite } from '@shulkr/backend/db';
import { commandHistory } from '@shulkr/backend/db/schema';
import { VANILLA_COMMANDS } from '@shulkr/shared/data/vanilla_commands';
import fs from 'fs';
import path from 'path';
import { ServerService } from '@shulkr/backend/services/server_service';

const serverService = new ServerService();

// Cache plugin commands per server (refreshed on demand)
const pluginCommandsCache = new Map<string, { commands: Array<string>; timestamp: number }>();
const PLUGIN_CACHE_TTL_MS = 5 * 60_000;

class CommandSuggestionService {
  async recordCommand(userId: number, serverId: string, command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) return;

    const existing = sqlite
      .prepare('SELECT id, use_count FROM command_history WHERE user_id = ? AND server_id = ? AND command = ?')
      .get(userId, serverId, trimmed) as { id: number; use_count: number } | undefined;

    if (existing) {
      sqlite
        .prepare('UPDATE command_history SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.id);
    } else {
      await db.insert(commandHistory).values({ user_id: userId, server_id: serverId, command: trimmed });
    }
  }

  async getSuggestions(userId: number, serverId: string, prefix: string): Promise<Array<string>> {
    const lowerPrefix = prefix.toLowerCase();
    const results = new Map<string, number>(); // command → score

    // 1. User history (highest priority)
    const historyRows = sqlite
      .prepare(
        `SELECT command, use_count FROM command_history
         WHERE user_id = ? AND server_id = ? AND command LIKE ? COLLATE NOCASE
         ORDER BY use_count DESC, last_used_at DESC
         LIMIT 20`
      )
      .all(userId, serverId, `${prefix}%`) as Array<{ command: string; use_count: number }>;

    for (const row of historyRows) {
      results.set(row.command, (results.get(row.command) ?? 0) + row.use_count * 3);
    }

    // 2. Vanilla commands
    for (const cmd of VANILLA_COMMANDS) {
      if (cmd.startsWith(lowerPrefix)) {
        results.set(cmd, (results.get(cmd) ?? 0) + 1);
      }
    }

    // 3. Plugin commands
    const pluginCmds = await this.getPluginCommands(serverId);
    for (const cmd of pluginCmds) {
      if (cmd.toLowerCase().startsWith(lowerPrefix)) {
        results.set(cmd, (results.get(cmd) ?? 0) + 1);
      }
    }

    // Sort by score desc, then alphabetically
    return [...results.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([cmd]) => cmd)
      .slice(0, 15);
  }

  async getHistory(userId: number, serverId: string, prefix: string): Promise<Array<string>> {
    const rows = sqlite
      .prepare(
        `SELECT command FROM command_history
         WHERE user_id = ? AND server_id = ? AND command LIKE ? COLLATE NOCASE
         ORDER BY use_count DESC, last_used_at DESC
         LIMIT 20`
      )
      .all(userId, serverId, `${prefix}%`) as Array<{ command: string }>;

    return rows.map((r) => r.command);
  }

  private async getPluginCommands(serverId: string): Promise<Array<string>> {
    const cached = pluginCommandsCache.get(serverId);
    if (cached && Date.now() - cached.timestamp < PLUGIN_CACHE_TTL_MS) {
      return cached.commands;
    }

    const commands: Array<string> = [];

    try {
      const server = await serverService.getServerById(serverId);
      if (!server) return commands;

      const pluginsDir = path.join(server.path, 'plugins');
      if (!fs.existsSync(pluginsDir)) return commands;

      const files = fs.readdirSync(pluginsDir);
      for (const file of files) {
        if (!file.endsWith('.jar')) continue;

        // Try to find a plugin.yml companion or extract commands from known patterns
        const pluginName = file
          .replace(/[-_][\d.]+\.jar$/, '')
          .replace('.jar', '')
          .toLowerCase();
        commands.push(pluginName);
      }
    } catch {}

    pluginCommandsCache.set(serverId, { commands, timestamp: Date.now() });
    return commands;
  }

  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    sqlite.prepare('DELETE FROM command_history WHERE last_used_at < ?').run(cutoff);
  }
}

export const commandSuggestionService = new CommandSuggestionService();
