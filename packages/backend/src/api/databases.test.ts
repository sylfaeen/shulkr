import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { auditLogs } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer, type SeededAuth } from '@shulkr/backend/test/seed';
import { createServerDatabase } from '@shulkr/backend/services/database_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

describe('POST /api/databases/:id/empty', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    testApp.deps.shell.reset();
  });

  async function setup(permissions: Array<string> = ['server:databases:delete']) {
    const auth = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions });
    const server = seedServer(testApp.deps);
    const { database } = await createServerDatabase(testApp.deps, { serverId: server.id, slug: 'flyteams' });

    testApp.deps.shell.reset();

    return { auth, server, database };
  }

  function empty(auth: SeededAuth, id: number, payload: { confirmation: string; password: string }) {
    return testApp.app.inject({ method: 'POST', url: `/api/databases/${id}/empty`, headers: auth.headers, payload });
  }

  function emptyCalls() {
    return testApp.deps.shell.calls.filter(
      (call) => call.command === testApp.deps.config.DATABASE_SCRIPT_PATH && call.args[0] === 'empty-db'
    );
  }

  it('empties the database and journals it when name and password match', async () => {
    const { auth, server, database } = await setup();

    const res = await empty(auth, database.id, { confirmation: database.dbName, password: auth.password });

    expect(res.statusCode).toBe(200);
    expect(emptyCalls().map((call) => call.args)).toEqual([['empty-db', database.dbName]]);

    const [entry] = await testApp.deps.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'empty'), eq(auditLogs.resource_id, server.id)));

    expect(entry.resource_type).toBe('server_database');
    expect(entry.details).toContain(database.dbName);
  });

  it('refuses when the typed name does not match', async () => {
    const { auth, database } = await setup();

    const res = await empty(auth, database.id, { confirmation: 's_000000_other', password: auth.password });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ErrorCodes.DATABASE_CONFIRMATION_MISMATCH);
    expect(emptyCalls()).toHaveLength(0);
  });

  it('refuses when the password is wrong', async () => {
    const { auth, database } = await setup();

    const res = await empty(auth, database.id, { confirmation: database.dbName, password: 'wrong-password' });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(ErrorCodes.AUTH_INVALID_PASSWORD);
    expect(emptyCalls()).toHaveLength(0);
  });

  it.each(['running', 'starting', 'stopping'] as const)('refuses while the server is %s', async (status) => {
    const { auth, database } = await setup();
    vi.spyOn(serverProcessManager, 'getStatus').mockReturnValue({ status, pid: 1, uptime: 1 });

    const res = await empty(auth, database.id, { confirmation: database.dbName, password: auth.password });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(ErrorCodes.SERVER_MUST_BE_STOPPED);
    expect(emptyCalls()).toHaveLength(0);
  });

  it('requires the delete permission', async () => {
    const { auth, database } = await setup(['server:databases:browse']);

    const res = await empty(auth, database.id, { confirmation: database.dbName, password: auth.password });

    expect(res.statusCode).toBe(403);
    expect(emptyCalls()).toHaveLength(0);
  });
});
