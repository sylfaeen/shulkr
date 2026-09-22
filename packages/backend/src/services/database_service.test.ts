import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { serverDatabases, servers } from '@shulkr/backend/db/schema';
import { createTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import {
  createServerDatabase,
  deleteDatabasesForServer,
  deleteServerDatabase,
  getServerDatabase,
  listServerDatabases,
  readDatabaseCredentials,
  rotateDatabasePassword,
} from '@shulkr/backend/services/database_service';

function scriptCalls(deps: TestDeps) {
  return deps.shell.calls.filter((call) => call.command === deps.config.DATABASE_SCRIPT_PATH);
}

function callsWithAction(deps: TestDeps, action: string) {
  return scriptCalls(deps).filter((call) => call.args[0] === action);
}

// assertEngineAvailable probes the engine through `usage`. The fake shell answers every run() with success, so the engine looks healthy unless a test says otherwise.
function makeEngineUnavailable(deps: TestDeps) {
  deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, {
    success: false,
    stdout: '',
    stderr: '{"success":false,"error":"MariaDB is not running. Start it with: systemctl start mariadb"}',
    exitCode: 1,
  });
}

describe('createServerDatabase', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  it('creates the database through the privileged script and returns the credentials once', async () => {
    const server = seedServer(deps);

    const result = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });

    expect(result.database.slug).toBe('flyteams');
    expect(result.database.dbName).toMatch(/^s_[0-9a-f]{6}_flyteams$/);
    expect(result.database.dbUser).toMatch(/^u_[0-9a-f]{6}_flyteams$/);
    expect(result.credentials.host).toBe('127.0.0.1');
    expect(result.credentials.port).toBe(3306);
    expect(result.credentials.password.length).toBeGreaterThanOrEqual(24);

    const create = callsWithAction(deps, 'create-db');
    expect(create).toHaveLength(1);
    expect(create[0].args).toEqual(['create-db', result.database.dbName, result.database.dbUser]);
    expect(create[0].opts).toMatchObject({ sudo: true });
  });

  // A password passed as an argument would show up in the process table for every process on the machine, Minecraft plugins included.
  it('sends the password on stdin and never as an argument', async () => {
    const server = seedServer(deps);

    const result = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });

    const create = callsWithAction(deps, 'create-db')[0];
    expect(create.args).not.toContain(result.credentials.password);
    expect(deps.shell.lastSpawnHandle()?.stdinHistory().join('')).toBe(`${result.credentials.password}\n`);
  });

  it('mints one prefix per server and reuses it for the next database', async () => {
    const server = seedServer(deps);

    const first = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const second = await createServerDatabase(deps, { serverId: server.id, slug: 'shop' });

    const prefix = first.database.dbName.split('_')[1];
    expect(second.database.dbName).toBe(`s_${prefix}_shop`);

    const [row] = await deps.db.select({ db_prefix: servers.db_prefix }).from(servers).where(eq(servers.id, server.id));
    expect(row.db_prefix).toBe(prefix);
  });

  it('stores the password encrypted, never in plaintext', async () => {
    const server = seedServer(deps);

    const result = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const row = await getServerDatabase(deps, result.database.id);

    expect(row?.password_encrypted).not.toBe(result.credentials.password);
    expect(readDatabaseCredentials(deps, row!).password).toBe(result.credentials.password);
  });

  it('rejects a slug already used on the same server', async () => {
    const server = seedServer(deps);
    await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });

    await expect(createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' })).rejects.toThrow(
      ErrorCodes.DATABASE_SLUG_TAKEN
    );
  });

  it('allows the same slug on a different server', async () => {
    const first = seedServer(deps);
    const second = seedServer(deps);

    const a = await createServerDatabase(deps, { serverId: first.id, slug: 'flyteams' });
    const b = await createServerDatabase(deps, { serverId: second.id, slug: 'flyteams' });

    expect(a.database.dbName).not.toBe(b.database.dbName);
  });

  it('refuses to go past the per-server limit', async () => {
    const limited = createTestDeps({ env: { MAX_DATABASES_PER_SERVER: '2' } });
    const server = seedServer(limited);

    await createServerDatabase(limited, { serverId: server.id, slug: 'one' });
    await createServerDatabase(limited, { serverId: server.id, slug: 'two' });

    await expect(createServerDatabase(limited, { serverId: server.id, slug: 'three' })).rejects.toThrow(
      ErrorCodes.DATABASE_LIMIT_REACHED
    );
  });

  it('refuses to create anything when the engine is down', async () => {
    const server = seedServer(deps);
    makeEngineUnavailable(deps);

    await expect(createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' })).rejects.toThrow(
      ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED
    );

    expect(callsWithAction(deps, 'create-db')).toHaveLength(0);
  });

  // A row without its MariaDB database is merely confusing. A MariaDB database without its row is invisible in the panel and can only be removed over SSH.
  it('leaves no row behind when the script fails', async () => {
    const server = seedServer(deps);

    deps.shell.mockSpawn(deps.config.DATABASE_SCRIPT_PATH, {
      success: false,
      stdout: '',
      stderr: '{"success":false,"error":"Database already exists"}',
      exitCode: 1,
    });

    await expect(createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' })).rejects.toThrow(
      ErrorCodes.DATABASE_SCRIPT_FAILED
    );

    const rows = await deps.db.select().from(serverDatabases).where(eq(serverDatabases.server_id, server.id));
    expect(rows).toHaveLength(0);
  });
});

describe('listServerDatabases', () => {
  it('never exposes the password, encrypted or not', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });

    const list = await listServerDatabases(deps, server.id);

    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('password');
  });

  it('returns an empty list without calling the engine', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);

    expect(await listServerDatabases(deps, server.id)).toEqual([]);
    expect(scriptCalls(deps)).toHaveLength(0);
  });
});

describe('rotateDatabasePassword', () => {
  it('replaces the stored password and asks the script to rotate it', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    const created = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const row = (await getServerDatabase(deps, created.database.id))!;

    const rotated = await rotateDatabasePassword(deps, row);

    expect(rotated.password).not.toBe(created.credentials.password);

    const rotate = callsWithAction(deps, 'rotate-password');
    expect(rotate).toHaveLength(1);
    expect(rotate[0].args).toEqual(['rotate-password', row.db_user, '127.0.0.1']);

    const reloaded = (await getServerDatabase(deps, created.database.id))!;
    expect(readDatabaseCredentials(deps, reloaded).password).toBe(rotated.password);
  });
});

describe('deleteServerDatabase', () => {
  it('drops the database through the script and removes the row', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    const created = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const row = (await getServerDatabase(deps, created.database.id))!;

    await deleteServerDatabase(deps, row);

    expect(callsWithAction(deps, 'drop-db')[0].args).toEqual(['drop-db', row.db_name]);
    expect(await getServerDatabase(deps, created.database.id)).toBeNull();
  });

  it('keeps the row when the script refuses to drop', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    const created = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const row = (await getServerDatabase(deps, created.database.id))!;

    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, { success: true, stdout: '{"success":true}', stderr: '', exitCode: 0 });

    deps.shell.mockRun(deps.config.DATABASE_SCRIPT_PATH, {
      success: false,
      stdout: '',
      stderr: '{"success":false,"error":"Failed to dump database"}',
      exitCode: 1,
    });

    await expect(deleteServerDatabase(deps, row)).rejects.toThrow(ErrorCodes.DATABASE_SCRIPT_FAILED);
    expect(await getServerDatabase(deps, created.database.id)).not.toBeNull();
  });
});

describe('deleteDatabasesForServer', () => {
  it('drops every database of the server before the row cascade', async () => {
    const deps = createTestDeps();
    const server = seedServer(deps);
    const first = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
    const second = await createServerDatabase(deps, { serverId: server.id, slug: 'shop' });

    await deleteDatabasesForServer(deps, server.id);

    const dropped = callsWithAction(deps, 'drop-db').map((call) => call.args[1]);
    expect(dropped).toEqual([first.database.dbName, second.database.dbName]);
    expect(await listServerDatabases(deps, server.id)).toEqual([]);
  });
});
