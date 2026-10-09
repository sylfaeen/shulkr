import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import {
  backupServer,
  getAllServers,
  getServerById,
  getNextAvailablePort,
  isPortAvailable,
} from '@shulkr/backend/services/server_service';
import { createServerDatabase } from '@shulkr/backend/services/database_service';
import { DATABASE_DUMP_DIR } from '@shulkr/backend/services/database_backup_service';
import { getServerSnapshot } from '@shulkr/backend/services/backup_service';
import { DEFAULT_JAVA_PORT } from '@shulkr/shared';

describe('server_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('getNextAvailablePort returns DEFAULT_JAVA_PORT when no servers exist', async () => {
    const port = await getNextAvailablePort(deps);
    expect(port).toBe(DEFAULT_JAVA_PORT);
  });

  it('getNextAvailablePort skips used ports', async () => {
    seedServer(deps, { javaPort: DEFAULT_JAVA_PORT });
    const port = await getNextAvailablePort(deps);
    expect(port).toBe(DEFAULT_JAVA_PORT + 1);
  });

  it('isPortAvailable returns false for taken ports, true otherwise', async () => {
    const taken = 25600;
    seedServer(deps, { javaPort: taken });
    expect(await isPortAvailable(deps, taken)).toBe(false);
    expect(await isPortAvailable(deps, taken + 1)).toBe(true);
  });

  it('getAllServers returns rows with status="stopped" for unstarted servers', async () => {
    seedServer(deps, { id: 'srv-listing-test', javaPort: 25700 });
    const all = await getAllServers(deps);
    const found = all.find((s) => s.id === 'srv-listing-test');
    expect(found).toBeDefined();
    expect(found?.status).toBe('stopped');
  });

  it('getServerById returns null for missing ids', async () => {
    const result = await getServerById(deps, 'srv-does-not-exist');
    expect(result).toBeNull();
  });
});

describe('backupServer database selection', () => {
  const dumpOk = { success: true, stdout: 'dump-bytes', stderr: '', exitCode: 0 };

  function dumpedDatabases(deps: TestDeps): Array<string> {
    return deps.shell.calls
      .filter((call) => call.command === deps.config.DATABASE_SCRIPT_PATH && call.args[0] === 'stream-dump')
      .map((call) => call.args[1]);
  }

  async function seedServerWithDatabases(deps: TestDeps) {
    const server = seedServer(deps, { path: '/srv/backup-selection' });
    deps.fs.put('/srv/backup-selection/world/level.dat', 'world');
    const first = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const second = await createServerDatabase(deps, { serverId: server.id, slug: 'flyshops' });

    return { server, first: first.database, second: second.database };
  }

  // Scheduled tasks saved before the selection existed carry paths but no databaseIds, they must keep producing the same archive after an update.
  it('keeps a selective backup without databaseIds free of any dump', async () => {
    const deps = createTestDeps();
    const { server } = await seedServerWithDatabases(deps);

    await backupServer(deps, server.id, ['/world'], 'auto');

    expect(dumpedDatabases(deps)).toEqual([]);
  });

  it('keeps dumping every database for a backup without paths nor databaseIds', async () => {
    const deps = createTestDeps();
    const { server, first, second } = await seedServerWithDatabases(deps);
    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);
    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);

    await backupServer(deps, server.id, undefined, 'auto');

    expect(dumpedDatabases(deps)).toEqual([first.dbName, second.dbName]);
  });

  it('dumps only the selected databases next to the selected files, then removes the dumps', async () => {
    const deps = createTestDeps();
    const { server, second } = await seedServerWithDatabases(deps);
    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);

    await backupServer(deps, server.id, ['/world'], 'manual', [second.id]);

    expect(dumpedDatabases(deps)).toEqual([second.dbName]);
    expect([...deps.fs.files.keys()].some((file) => file.includes(DATABASE_DUMP_DIR))).toBe(false);
  });

  it('runs a database-only backup as a selective one, without touching the incremental snapshot', async () => {
    const deps = createTestDeps();
    const { server, first } = await seedServerWithDatabases(deps);
    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);

    await backupServer(deps, server.id, [], 'manual', [first.id]);

    expect(dumpedDatabases(deps)).toEqual([first.dbName]);
    expect(await getServerSnapshot(deps, server.id)).toBeNull();
  });
});
