import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer, seedUser } from '@shulkr/backend/test/seed';
import { recordCommand, getCommandHistory, getCommandSuggestions } from '@shulkr/backend/services/command_suggestion_service';

describe('command_suggestion_service', () => {
  let deps: TestDeps;
  let serverId: string;
  let userId: number;

  beforeAll(async () => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
    const user = await seedUser(deps);
    userId = user.id;
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('recordCommand inserts on first use, increments use_count on subsequent uses', async () => {
    await recordCommand(deps, userId, serverId, 'gamemode creative');
    await recordCommand(deps, userId, serverId, 'gamemode creative');
    const row = deps.sqlite
      .prepare('SELECT use_count FROM command_history WHERE user_id = ? AND server_id = ? AND command = ?')
      .get(userId, serverId, 'gamemode creative') as { use_count: number } | undefined;
    expect(row?.use_count).toBe(2);
  });

  it('recordCommand ignores empty commands', async () => {
    await recordCommand(deps, userId, serverId, '   ');
    const row = deps.sqlite
      .prepare('SELECT COUNT(*) as count FROM command_history WHERE user_id = ? AND command = ?')
      .get(userId, '') as { count: number };
    expect(row.count).toBe(0);
  });

  it('getCommandHistory returns commands matching the prefix', () => {
    const matches = getCommandHistory(deps, userId, serverId, 'game');
    expect(matches).toContain('gamemode creative');
  });

  it('getCommandSuggestions includes vanilla commands matching the prefix', async () => {
    const suggestions = await getCommandSuggestions(deps, userId, serverId, 'tp');
    // VANILLA_COMMANDS contains 'tp' and 'tpa' etc.
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
