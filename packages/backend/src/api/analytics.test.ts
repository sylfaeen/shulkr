import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer, type SeededAuth, type SeededServer } from '@shulkr/backend/test/seed';

const FROZEN_NOW = '2026-01-01T00:00:00Z';

describe('analytics routes (story 58.5 pilot)', () => {
  let testApp: TestApp;
  let auth: SeededAuth;
  let server: SeededServer;

  beforeAll(async () => {
    testApp = await createTestApp({ now: FROZEN_NOW });

    auth = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:players:history'],
    });

    server = seedServer(testApp.deps, { id: 'srv-analytics' });
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  function seedSession(serverId: string, joinedAt: string, leftAt: string | null, playerName: string): void {
    testApp.deps.sqlite
      .prepare(
        `INSERT INTO player_sessions (server_id, player_name, joined_at, left_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(serverId, playerName, joinedAt, leftAt);
  }

  it('GET /analytics/activity returns hourly buckets over 7d', async () => {
    seedSession(server.id, '2025-12-28T10:00:00Z', '2025-12-28T11:00:00Z', 'alice');
    seedSession(server.id, '2025-12-28T10:30:00Z', '2025-12-28T11:30:00Z', 'bob');
    seedSession(server.id, '2025-12-30T18:15:00Z', '2025-12-30T19:00:00Z', 'carol');

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/analytics/activity?period=7d`,
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ timestamp: string; playerCount: number }>;
    expect(body).toContainEqual({ timestamp: '2025-12-28 10:00', playerCount: 2 });
    expect(body).toContainEqual({ timestamp: '2025-12-30 18:00', playerCount: 1 });
  });

  it('GET /analytics/peak-hours computes per-(dow,hour) averages', async () => {
    const otherServer = seedServer(testApp.deps, { id: 'srv-peak' });
    // Two Mondays at 14h with 1 player each → avg 1.0 player at (Mon=0, 14h)
    seedSession(otherServer.id, '2025-12-29T14:00:00Z', '2025-12-29T14:30:00Z', 'p1'); // Mon
    seedSession(otherServer.id, '2025-12-22T14:00:00Z', '2025-12-22T14:30:00Z', 'p2'); // Mon

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${otherServer.id}/analytics/peak-hours?period=30d`,
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ dayOfWeek: number; hour: number; avgPlayers: number }>;
    const monday14 = body.find((cell) => cell.dayOfWeek === 0 && cell.hour === 14);
    expect(monday14).toBeDefined();
    expect(monday14?.avgPlayers).toBe(1);
  });

  it('GET /analytics/session-duration averages minutes per day', async () => {
    const otherServer = seedServer(testApp.deps, { id: 'srv-duration' });
    // Two sessions on the same day, durations: 60min and 30min → avg 45 min
    seedSession(otherServer.id, '2025-12-28T10:00:00Z', '2025-12-28T11:00:00Z', 'a');
    seedSession(otherServer.id, '2025-12-28T15:00:00Z', '2025-12-28T15:30:00Z', 'b');

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${otherServer.id}/analytics/session-duration?period=7d`,
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ date: string; avgMinutes: number }>;
    expect(body).toContainEqual({ date: '2025-12-28', avgMinutes: 45 });
  });

  it('GET /analytics/summary aggregates all 5 KPIs', async () => {
    const otherServer = seedServer(testApp.deps, { id: 'srv-summary' });
    seedSession(otherServer.id, '2025-12-28T10:00:00Z', '2025-12-28T11:00:00Z', 'alice'); // 60min
    seedSession(otherServer.id, '2025-12-28T10:30:00Z', '2025-12-28T11:30:00Z', 'bob'); // 60min
    seedSession(otherServer.id, '2025-12-29T14:00:00Z', '2025-12-29T14:30:00Z', 'carol'); // 30min

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${otherServer.id}/analytics/summary?period=7d`,
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      uniquePlayers: number;
      totalSessions: number;
      avgDurationMinutes: number;
      peakSimultaneous: number;
      mostActiveHour: number;
    };

    expect(body.uniquePlayers).toBe(3);
    expect(body.totalSessions).toBe(3);
    expect(body.avgDurationMinutes).toBe(50); // (60+60+30)/3
    expect(body.peakSimultaneous).toBe(2); // 2 players in 10:00 hour bucket
    expect(body.mostActiveHour).toBe(10); // 2 sessions at hour 10
  });

  it('GET /analytics/retention returns cohorts with weekly retention', async () => {
    const otherServer = seedServer(testApp.deps, { id: 'srv-retention' });
    // Cohort 2025-W52: alice + bob join, only alice returns in W53
    seedSession(otherServer.id, '2025-12-22T10:00:00Z', '2025-12-22T11:00:00Z', 'alice');
    seedSession(otherServer.id, '2025-12-23T10:00:00Z', '2025-12-23T11:00:00Z', 'bob');
    seedSession(otherServer.id, '2025-12-29T10:00:00Z', '2025-12-29T11:00:00Z', 'alice');

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${otherServer.id}/analytics/retention?weeks=4`,
      headers: auth.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ weekStart: string; totalPlayers: number; retention: Array<number> }>;
    const cohort = body.find((c) => c.weekStart === '2025-51');
    expect(cohort).toBeDefined();
    expect(cohort?.totalPlayers).toBe(2);
    expect(cohort?.retention[0]).toBe(100); // W+0: both alice and bob
    expect(cohort?.retention[1]).toBe(50); // W+1: only alice (1 of 2)
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/analytics/activity?period=7d`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the user lacks server:players:history', async () => {
    const otherAuth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/analytics/activity?period=7d`,
      headers: otherAuth.headers,
    });

    expect(res.statusCode).toBe(403);
  });

  // Regression test for the pre-58.5 timezone bug: Date.now() inline meant results depended on the OS time zone. With deps.clock() injected and TZ pinned to UTC in setup.ts, results must be byte-identical across runs.
  it('produces deterministic timestamps regardless of process start time', async () => {
    const res1 = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/analytics/activity?period=7d`,
      headers: auth.headers,
    });

    const res2 = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/analytics/activity?period=7d`,
      headers: auth.headers,
    });

    expect(res1.body).toBe(res2.body);
  });
});
