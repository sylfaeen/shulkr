import type { AppDeps } from '@shulkr/backend/deps';

export type AnalyticsPeriod = '24h' | '7d' | '30d';

interface RetentionCohort {
  weekStart: string;
  totalPlayers: number;
  retention: Array<number>;
}

interface ActivityPoint {
  timestamp: string;
  playerCount: number;
}

interface PeakHourCell {
  dayOfWeek: number;
  hour: number;
  avgPlayers: number;
}

interface SessionDurationPoint {
  date: string;
  avgMinutes: number;
}

interface AnalyticsSummary {
  uniquePlayers: number;
  totalSessions: number;
  avgDurationMinutes: number;
  peakSimultaneous: number;
  mostActiveHour: number;
}

type Deps = Pick<AppDeps, 'sqlite' | 'clock'>;

function periodToMs(period: AnalyticsPeriod): number {
  switch (period) {
    case '24h':
      return 86_400_000;
    case '7d':
      return 604_800_000;
    case '30d':
      return 2_592_000_000;
  }
}

function periodToGroupBy(period: AnalyticsPeriod): string {
  switch (period) {
    case '24h':
      return "strftime('%Y-%m-%d %H:00', joined_at)";
    case '7d':
      return "strftime('%Y-%m-%d %H:00', joined_at)";
    case '30d':
      return "strftime('%Y-%m-%d', joined_at)";
  }
}

function sinceFrom(deps: Deps, period: AnalyticsPeriod): string {
  return new Date(deps.clock().getTime() - periodToMs(period)).toISOString();
}

export function analyticsActivity(deps: Deps, serverId: string, period: AnalyticsPeriod): Array<ActivityPoint> {
  const since = sinceFrom(deps, period);
  const groupExpr = periodToGroupBy(period);

  const rows = deps.sqlite
    .prepare(
      `SELECT ${groupExpr} AS bucket, COUNT(DISTINCT player_name) AS cnt
       FROM player_sessions
       WHERE server_id = ? AND joined_at >= ?
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(serverId, since) as Array<{ bucket: string; cnt: number }>;

  return rows.map((r) => ({ timestamp: r.bucket, playerCount: r.cnt }));
}

export function analyticsPeakHours(deps: Deps, serverId: string, period: AnalyticsPeriod): Array<PeakHourCell> {
  const since = sinceFrom(deps, period);

  // SQLite strftime %w: 0=Sunday; remap to 0=Monday with (dow + 6) % 7.
  const rows = deps.sqlite
    .prepare(
      `SELECT
         CAST(strftime('%w', joined_at) AS INTEGER) AS dow,
         CAST(strftime('%H', joined_at) AS INTEGER) AS hour,
         COUNT(DISTINCT player_name) AS total_joins,
         COUNT(DISTINCT strftime('%Y-%m-%d', joined_at)) AS days_count
       FROM player_sessions
       WHERE server_id = ? AND joined_at >= ?
       GROUP BY dow, hour
       ORDER BY dow, hour`
    )
    .all(serverId, since) as Array<{ dow: number; hour: number; total_joins: number; days_count: number }>;

  return rows.map((r) => ({
    dayOfWeek: (r.dow + 6) % 7,
    hour: r.hour,
    avgPlayers: r.days_count > 0 ? Math.round((r.total_joins / r.days_count) * 10) / 10 : 0,
  }));
}

export function analyticsSessionDuration(deps: Deps, serverId: string, period: AnalyticsPeriod): Array<SessionDurationPoint> {
  const since = sinceFrom(deps, period);

  const rows = deps.sqlite
    .prepare(
      `SELECT strftime('%Y-%m-%d', joined_at) AS day,
              AVG(
                CASE WHEN left_at IS NOT NULL
                  THEN (julianday(left_at) - julianday(joined_at)) * 1440
                  ELSE NULL
                END
              ) AS avg_min
       FROM player_sessions
       WHERE server_id = ? AND joined_at >= ? AND left_at IS NOT NULL
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(serverId, since) as Array<{ day: string; avg_min: number | null }>;

  return rows.filter((r) => r.avg_min !== null).map((r) => ({ date: r.day, avgMinutes: Math.round(r.avg_min! * 10) / 10 }));
}

export function analyticsSummary(deps: Deps, serverId: string, period: AnalyticsPeriod): AnalyticsSummary {
  const since = sinceFrom(deps, period);

  const row = deps.sqlite
    .prepare(
      `SELECT
         COUNT(DISTINCT player_name) AS unique_players,
         COUNT(*) AS total_sessions,
         AVG(
           CASE WHEN left_at IS NOT NULL
             THEN (julianday(left_at) - julianday(joined_at)) * 1440
             ELSE NULL
           END
         ) AS avg_duration
       FROM player_sessions
       WHERE server_id = ? AND joined_at >= ?`
    )
    .get(serverId, since) as { unique_players: number; total_sessions: number; avg_duration: number | null };

  // Peak simultaneous: approximated by the max distinct players per hour bucket.
  const peakRow = deps.sqlite
    .prepare(
      `SELECT MAX(cnt) AS peak FROM (
         SELECT COUNT(DISTINCT player_name) AS cnt
         FROM player_sessions
         WHERE server_id = ? AND joined_at >= ?
         GROUP BY strftime('%Y-%m-%d %H', joined_at)
       )`
    )
    .get(serverId, since) as { peak: number | null };

  const activeHourRow = deps.sqlite
    .prepare(
      `SELECT CAST(strftime('%H', joined_at) AS INTEGER) AS hour, COUNT(*) AS cnt
       FROM player_sessions
       WHERE server_id = ? AND joined_at >= ?
       GROUP BY hour
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .get(serverId, since) as { hour: number; cnt: number } | undefined;

  return {
    uniquePlayers: row.unique_players,
    totalSessions: row.total_sessions,
    avgDurationMinutes: row.avg_duration !== null ? Math.round(row.avg_duration * 10) / 10 : 0,
    peakSimultaneous: peakRow?.peak ?? 0,
    mostActiveHour: activeHourRow?.hour ?? 0,
  };
}

export function analyticsRetention(deps: Deps, serverId: string, weeks: number): Array<RetentionCohort> {
  const playerFirstWeeks = deps.sqlite
    .prepare(
      `SELECT player_name, strftime('%Y-%W', MIN(joined_at)) AS first_week
       FROM player_sessions
       WHERE server_id = ?
       GROUP BY player_name`
    )
    .all(serverId) as Array<{ player_name: string; first_week: string }>;

  if (playerFirstWeeks.length === 0) return [];

  const playerActiveWeeks = deps.sqlite
    .prepare(
      `SELECT player_name, strftime('%Y-%W', joined_at) AS active_week
       FROM player_sessions
       WHERE server_id = ?
       GROUP BY player_name, active_week`
    )
    .all(serverId) as Array<{ player_name: string; active_week: string }>;

  const activeWeeksByPlayer = new Map<string, Set<string>>();

  for (const row of playerActiveWeeks) {
    if (!activeWeeksByPlayer.has(row.player_name)) activeWeeksByPlayer.set(row.player_name, new Set());
    activeWeeksByPlayer.get(row.player_name)!.add(row.active_week);
  }

  const cohortPlayers = new Map<string, Array<string>>();

  for (const row of playerFirstWeeks) {
    if (!cohortPlayers.has(row.first_week)) cohortPlayers.set(row.first_week, []);
    cohortPlayers.get(row.first_week)!.push(row.player_name);
  }

  const allWeeks = new Set<string>();
  for (const row of playerActiveWeeks) allWeeks.add(row.active_week);
  for (const row of playerFirstWeeks) allWeeks.add(row.first_week);
  const sortedWeeks = [...allWeeks].sort();

  const cohorts: Array<RetentionCohort> = [];
  const weekIndex = new Map(sortedWeeks.map((w, i) => [w, i]));
  const recentWeeks = sortedWeeks.slice(-weeks);

  for (const cohortWeek of recentWeeks) {
    const players = cohortPlayers.get(cohortWeek);
    if (!players || players.length === 0) continue;
    const cohortIdx = weekIndex.get(cohortWeek)!;
    const retention: Array<number> = [];

    for (let offset = 0; offset <= weeks && cohortIdx + offset < sortedWeeks.length; offset++) {
      const targetWeek = sortedWeeks[cohortIdx + offset];
      const retained = players.filter((p) => activeWeeksByPlayer.get(p)?.has(targetWeek)).length;
      retention.push(Math.round((retained / players.length) * 100));
    }

    cohorts.push({
      weekStart: cohortWeek,
      totalPlayers: players.length,
      retention,
    });
  }

  return cohorts;
}
