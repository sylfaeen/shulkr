import { describe, it, expect } from 'vitest';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { createServerDatabase } from '@shulkr/backend/services/database_service';
import { writeDatabaseDumps, clearDatabaseDumps, DATABASE_DUMP_DIR } from '@shulkr/backend/services/database_backup_service';

const dumpOk = { success: true, stdout: 'dump-bytes', stderr: '', exitCode: 0 };

describe('writeDatabaseDumps', () => {
  it('asks the privileged script to stream one dump per database of the server', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    const first = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const second = await createServerDatabase(deps, { serverId: server.id, slug: 'flyshops' });

    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);
    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);

    expect(await writeDatabaseDumps(deps, server.id, '/tmp/server')).toBe(2);

    const dumps = deps.shell.calls.filter(
      (call) => call.command === deps.config.DATABASE_SCRIPT_PATH && call.args[0] === 'stream-dump'
    );

    expect(dumps.map((call) => call.args[1])).toEqual([first.database.dbName, second.database.dbName]);
    expect(dumps[0].opts).toMatchObject({ sudo: true });
  });

  it('does nothing when the server has no database', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);

    expect(await writeDatabaseDumps(deps, server.id, '/tmp/server')).toBe(0);
    expect(deps.shell.calls).toHaveLength(0);
  });

  // A backup missing one dump is still worth having, so a failing dump must not take the archive down with it.
  it('skips a failing dump and keeps the others', async () => {
    const deps = createTestDeps({ collectLogs: true });
    const server = seedServer(deps);
    await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    await createServerDatabase(deps, { serverId: server.id, slug: 'flyshops' });

    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, {
      success: false,
      stdout: '',
      stderr: 'mariadb-dump: boom',
      exitCode: 1,
    });

    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, dumpOk);

    expect(await writeDatabaseDumps(deps, server.id, '/tmp/server')).toBe(1);
  });

  it('removes the dump directory afterwards', async () => {
    const deps = createTestDeps();

    await clearDatabaseDumps(deps, '/tmp/server');

    expect(DATABASE_DUMP_DIR).toBe('.shulkr-databases');
  });
});
