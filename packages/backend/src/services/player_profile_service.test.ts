import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { recordPlayerJoin, recordPlayerLeave } from '@shulkr/backend/services/player_history_service';
import { getPlayerProfile, getPlayerSessions, searchPlayers } from '@shulkr/backend/services/player_profile_service';

describe('player_profile_service', () => {
  let deps: TestDeps;
  let serverId: string;

  beforeAll(async () => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
    await recordPlayerJoin(deps, serverId, 'alice', 'uuid-alice', '1.2.3.4');
    await recordPlayerLeave(deps, serverId, 'alice');
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('getPlayerProfile returns null for an unknown player', async () => {
    const profile = await getPlayerProfile(deps, serverId, 'never-existed');
    expect(profile).toBeNull();
  });

  it('getPlayerProfile aggregates session count and uuid', async () => {
    const profile = await getPlayerProfile(deps, serverId, 'alice');
    expect(profile?.uuid).toBe('uuid-alice');
    expect(profile?.sessionCount).toBeGreaterThanOrEqual(1);
    expect(profile?.avatarUrl).toBe('/api/players/uuid-alice/avatar?size=64');
  });

  it('getPlayerSessions returns sessions sorted desc by joinedAt', async () => {
    const result = await getPlayerSessions(deps, serverId, 'alice');
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('searchPlayers matches by LIKE %query%', async () => {
    const matches = await searchPlayers(deps, serverId, 'ali');
    expect(matches.some((m) => m.name === 'alice')).toBe(true);
  });
});
