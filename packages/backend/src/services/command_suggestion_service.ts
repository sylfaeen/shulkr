import { commandHistory } from '@shulkr/backend/db/schema';
import { VANILLA_COMMANDS } from '@shulkr/shared/data/vanilla_commands';
import { join } from 'node:path';
import { getServerById } from '@shulkr/backend/services/server_service';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

const PLUGIN_CACHE_TTL_MS = 5 * 60_000;

type Deps = Pick<AppDeps, 'db' | 'sqlite' | 'fs' | 'clock'>;

const pluginCommandsCache = new Map<string, { commands: Array<string>; timestamp: number }>();

async function getPluginCommands(deps: Deps, serverId: string): Promise<Array<string>> {
  const cached = pluginCommandsCache.get(serverId);

  if (cached && deps.clock().getTime() - cached.timestamp < PLUGIN_CACHE_TTL_MS) {
    return cached.commands;
  }

  const commands: Array<string> = [];

  try {
    const server = await getServerById(getAppDeps(), serverId);
    if (!server) return commands;
    const pluginsDir = join(server.path, 'plugins');
    if (!(await deps.fs.exists(pluginsDir))) return commands;
    const files = await deps.fs.readdir(pluginsDir);

    for (const file of files) {
      if (!file.endsWith('.jar')) continue;

      const pluginName = file
        .replace(/[-_][\d.]+\.jar$/, '')
        .replace('.jar', '')
        .toLowerCase();

      commands.push(pluginName);
    }
  } catch {}

  pluginCommandsCache.set(serverId, { commands, timestamp: deps.clock().getTime() });

  return commands;
}

export async function recordCommand(deps: Deps, userId: number, serverId: string, command: string): Promise<void> {
  const trimmed = command.trim();
  if (!trimmed) return;

  const existing = deps.sqlite
    .prepare('SELECT id, use_count FROM command_history WHERE user_id = ? AND server_id = ? AND command = ?')
    .get(userId, serverId, trimmed) as { id: number; use_count: number } | undefined;

  if (existing) {
    deps.sqlite
      .prepare('UPDATE command_history SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(existing.id);
  } else {
    await deps.db.insert(commandHistory).values({ user_id: userId, server_id: serverId, command: trimmed });
  }
}

export async function getCommandSuggestions(
  deps: Deps,
  userId: number,
  serverId: string,
  prefix: string
): Promise<Array<string>> {
  const lowerPrefix = prefix.toLowerCase();
  const results = new Map<string, number>();

  const historyRows = deps.sqlite
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

  for (const cmd of VANILLA_COMMANDS) {
    if (cmd.startsWith(lowerPrefix)) {
      results.set(cmd, (results.get(cmd) ?? 0) + 1);
    }
  }

  const pluginCmds = await getPluginCommands(deps, serverId);

  for (const cmd of pluginCmds) {
    if (cmd.toLowerCase().startsWith(lowerPrefix)) {
      results.set(cmd, (results.get(cmd) ?? 0) + 1);
    }
  }

  return [...results.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cmd]) => cmd)
    .slice(0, 15);
}

export function getCommandHistory(deps: Deps, userId: number, serverId: string, prefix: string): Array<string> {
  const rows = deps.sqlite
    .prepare(
      `SELECT command FROM command_history
       WHERE user_id = ? AND server_id = ? AND command LIKE ? COLLATE NOCASE
       ORDER BY use_count DESC, last_used_at DESC
       LIMIT 20`
    )
    .all(userId, serverId, `${prefix}%`) as Array<{ command: string }>;

  return rows.map((r) => r.command);
}

export async function cleanupCommandHistory(deps: Deps): Promise<void> {
  const cutoff = new Date(deps.clock().getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  deps.sqlite.prepare('DELETE FROM command_history WHERE last_used_at < ?').run(cutoff);
}
