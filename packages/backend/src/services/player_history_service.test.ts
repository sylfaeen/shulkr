import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import {
  recordPlayerJoin,
  recordPlayerLeave,
  closeAllPlayerSessions,
  queryPlayerHistory,
} from '@shulkr/backend/services/player_history_service';

describe('player_history_service', () => {
  let deps: TestDeps;
  let serverId: string;

  beforeAll(() => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('recordPlayerJoin inserts an open session', async () => {
    await recordPlayerJoin(deps, serverId, 'alice', null, '1.2.3.4');
    const result = queryPlayerHistory(deps, serverId, 10, 0);
    const session = result.sessions.find((s) => s.playerName === 'alice');
    expect(session).toBeDefined();
    expect(session?.leftAt).toBeNull();
  });

  it('recordPlayerLeave closes the most recent open session', async () => {
    await recordPlayerJoin(deps, serverId, 'bob', 'uuid-bob', '1.2.3.5');
    await recordPlayerLeave(deps, serverId, 'bob');
    const result = queryPlayerHistory(deps, serverId, 100, 0);
    const session = result.sessions.find((s) => s.playerName === 'bob');
    expect(session?.leftAt).not.toBeNull();
  });

  it('closeAllPlayerSessions closes every open session for a server', async () => {
    const otherServer = seedServer(deps).id;
    await recordPlayerJoin(deps, otherServer, 'p1', null, null);
    await recordPlayerJoin(deps, otherServer, 'p2', null, null);
    await closeAllPlayerSessions(deps, otherServer);
    const result = queryPlayerHistory(deps, otherServer, 10, 0);
    expect(result.sessions.every((s) => s.leftAt !== null)).toBe(true);
  });
});
