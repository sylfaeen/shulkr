import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { playersService } from '@shulkr/backend/services/players_service';

// Smoke tests only, players_service is an EventEmitter with module-level state used by 6+ callers. Story 58.6.3 keeps the class shape; the proper function-based migration belongs in story 58.7's bigbang along with the remaining serverProcessManager refactor.
describe('players_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    // parseLogLine fires off playerHistoryService.recordJoin which writes to player_sessions (FK to servers). Need both the schema applied and a real server row to satisfy the FK.
    deps = createTestDeps();
  });

  it('getPlayers returns [] for an unknown server', () => {
    expect(playersService.getPlayers('srv-unknown')).toEqual([]);
  });

  it('getPlayerCount returns 0 for an unknown server', () => {
    expect(playersService.getPlayerCount('srv-unknown')).toBe(0);
  });

  it('parseLogLine recognises a join line and tracks the player', () => {
    const serverId = seedServer(deps).id;
    const matched = playersService.parseLogLine(serverId, '[12:34:56 INFO]: alice joined the game');
    expect(matched).toBe(true);
    expect(playersService.getPlayers(serverId)).toContain('alice');
    playersService.removeServer(serverId);
  });

  it('parseLogLine recognises a leave line and untracks the player', () => {
    const serverId = seedServer(deps).id;
    playersService.parseLogLine(serverId, '[12:34:56 INFO]: bob joined the game');
    const matched = playersService.parseLogLine(serverId, '[12:35:56 INFO]: bob left the game');
    expect(matched).toBe(true);
    expect(playersService.getPlayers(serverId)).not.toContain('bob');
    playersService.removeServer(serverId);
  });
});
