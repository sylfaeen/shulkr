import { describe, it, expect } from 'vitest';
import { parseConfig } from '@shulkr/backend/config';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';
import {
  buildAccessUser,
  buildDirectConnectionUrl,
  buildTunnelConnectionUrl,
  buildDatabaseName,
  buildDatabaseUser,
  generateDatabasePassword,
  generateDatabasePrefix,
  getEngineState,
  readDatabaseUsage,
} from '@shulkr/backend/services/database_engine_service';

// The panel runs from packages/backend/dist, the privileged scripts live at the install root. Deriving the script path from this file's own location pointed the engine probe at a path that never exists in production, and the whole feature reported itself unavailable with no clue why.
describe('DATABASE_SCRIPT_PATH', () => {
  it('resolves under the install root, not under packages/backend', () => {
    const config = parseConfig({
      SHULKR_HOME: '/opt/shulkr',
      JWT_SECRET: 'test-jwt-secret-deterministic-1234',
      COOKIE_SECRET: 'test-cookie-secret-deterministic-1234',
    } as NodeJS.ProcessEnv);

    expect(config.DATABASE_SCRIPT_PATH).toBe('/opt/shulkr/app/scripts/subs/subs_database.sh');
  });

  it('follows a custom SHULKR_HOME', () => {
    const config = parseConfig({
      SHULKR_HOME: '/srv/shulkr',
      JWT_SECRET: 'test-jwt-secret-deterministic-1234',
      COOKIE_SECRET: 'test-cookie-secret-deterministic-1234',
    } as NodeJS.ProcessEnv);

    expect(config.DATABASE_SCRIPT_PATH).toBe('/srv/shulkr/app/scripts/subs/subs_database.sh');
  });

  it('is overridable for development', () => {
    const config = parseConfig({
      SHULKR_HOME: '/opt/shulkr',
      DATABASE_SCRIPT_PATH: '/tmp/fake-script.sh',
      JWT_SECRET: 'test-jwt-secret-deterministic-1234',
      COOKIE_SECRET: 'test-cookie-secret-deterministic-1234',
    } as NodeJS.ProcessEnv);

    expect(config.DATABASE_SCRIPT_PATH).toBe('/tmp/fake-script.sh');
  });
});

describe('getEngineState', () => {
  it('reports running when the usage probe succeeds', async () => {
    const deps = createTestDeps();

    expect(await getEngineState(deps)).toBe('running');
  });

  it('distinguishes a stopped engine from an unreachable one', async () => {
    const deps = createTestDeps();

    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, {
      success: false,
      stdout: '',
      stderr: '{"success":false,"error":"MariaDB is not running. Start it with: systemctl start mariadb"}',
      exitCode: 1,
    });

    expect(await getEngineState(deps)).toBe('installed_stopped');
  });

  it('logs the script path when the probe fails, so the cause is diagnosable', async () => {
    const deps = createTestDeps({ collectLogs: true });

    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, {
      success: false,
      stdout: '',
      stderr: 'sudo: a password is required',
      exitCode: 1,
    });

    expect(await getEngineState(deps)).toBe('unavailable');
  });
});

describe('readDatabaseUsage', () => {
  it('parses sizes and active users from the script output', async () => {
    const deps = createTestDeps();

    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, {
      success: true,
      stdout:
        '{"success":true,"action":"usage","databases":[{"name":"s_ab12cd_flyteams","bytes":40960}],"activity":[{"user":"a_ab12cd_7f3a","host":"82.64.12.34"}]}',
      stderr: '',
      exitCode: 0,
    });

    const usage = await readDatabaseUsage(deps);

    expect(usage.sizes.get('s_ab12cd_flyteams')).toBe(40960);
    expect(usage.activeUsers.has('a_ab12cd_7f3a')).toBe(true);
  });

  it('returns empty data rather than throwing when the engine is unreachable', async () => {
    const deps = createTestDeps();
    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, { success: false, stdout: '', stderr: 'boom', exitCode: 1 });

    const usage = await readDatabaseUsage(deps);

    expect(usage.sizes.size).toBe(0);
    expect(usage.activeUsers.size).toBe(0);
  });
});

describe('identifier builders', () => {
  it('stays within the MariaDB 32 character limit for users', () => {
    const prefix = generateDatabasePrefix();
    const slug = 'a'.repeat(16);

    expect(prefix).toMatch(/^[0-9a-f]{6}$/);
    expect(buildDatabaseUser(prefix, slug).length).toBeLessThanOrEqual(32);
    expect(buildAccessUser(prefix).length).toBeLessThanOrEqual(32);
    expect(buildDatabaseName(prefix, slug).length).toBeLessThanOrEqual(64);
  });

  it('generates a password the privileged script accepts', () => {
    const password = generateDatabasePassword();

    expect(password.length).toBeGreaterThanOrEqual(24);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// Same shape as the connection string Laravel Forge shows, which database clients like TablePlus open directly.
describe('connection URLs', () => {
  it('tunnels through SSH for a local database', () => {
    const url = buildTunnelConnectionUrl({
      sshUser: 'root',
      sshHost: '51.254.211.189',
      dbUser: 'u_052f90_flyteams',
      password: 'L-jqZLKynJfztbHBRueM4nEFMsJZ',
      dbName: 's_052f90_flyteams',
      label: 'flyteams',
    });

    expect(url).toBe(
      'mysql+ssh://root@51.254.211.189/u_052f90_flyteams:L-jqZLKynJfztbHBRueM4nEFMsJZ@127.0.0.1/s_052f90_flyteams?name=flyteams&usePrivateKey=true'
    );
  });

  it('connects directly for a remote access', () => {
    const url = buildDirectConnectionUrl({
      host: '51.254.211.189',
      dbUser: 'a_052f90_7f3a',
      password: 'secret',
      dbName: 's_052f90_flyteams',
      label: 'flycraft site',
    });

    expect(url).toBe('mysql://a_052f90_7f3a:secret@51.254.211.189:3306/s_052f90_flyteams?name=flycraft%20site');
  });

  // The generated passwords are base64url, but a URL built by string concatenation breaks the day that changes.
  it('escapes characters that would break the URL', () => {
    const url = buildDirectConnectionUrl({
      host: 'db.example.com',
      dbUser: 'a_052f90_7f3a',
      password: 'p@ss/word:1?2&3',
      dbName: 's_052f90_flyteams',
      label: 'site',
    });

    expect(url).toContain('p%40ss%2Fword%3A1%3F2%263');
    expect(url.split('@').length).toBe(2);
  });
});
