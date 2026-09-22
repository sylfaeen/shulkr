import { describe, it, expect } from 'vitest';
import { ErrorCodes } from '@shulkr/shared';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';
import { execReadOnlyQuery } from '@shulkr/backend/services/database_query_service';
import type { ServerDatabaseRow } from '@shulkr/backend/db/schema';

const row: ServerDatabaseRow = {
  id: 1,
  server_id: 'srv-1',
  slug: 'flyteams',
  db_name: 's_ab12cd_flyteams',
  db_user: 'u_ab12cd_flyteams',
  password_encrypted: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// These statements are refused before any connection is opened, so the test needs no MariaDB. The server-side read-only transaction is the barrier that actually holds; this check exists so a mistyped write fails with a message the reader understands.
describe('execReadOnlyQuery', () => {
  it.each([
    ['UPDATE teams SET balance = 999', 'read-only queries only'],
    ['DELETE FROM teams', 'read-only queries only'],
    ['DROP TABLE teams', 'read-only queries only'],
    ['INSERT INTO teams VALUES (1)', 'read-only queries only'],
    ['CREATE TABLE evil (id INT)', 'read-only queries only'],
    ['GRANT ALL ON *.* TO evil', 'read-only queries only'],
    ['SELECT 1; DROP TABLE teams', 'only one statement at a time'],
  ])('rejects %s', async (sql, reason) => {
    const deps = createTestDeps();

    await expect(execReadOnlyQuery(deps, row, sql)).rejects.toThrow(reason);
  });

  it('rejects before reaching the database, so nothing is executed', async () => {
    const deps = createTestDeps();

    await expect(execReadOnlyQuery(deps, row, 'DELETE FROM teams')).rejects.toThrow(ErrorCodes.DATABASE_QUERY_FAILED);
  });

  it.each(['SELECT * FROM teams', 'select 1', '  SHOW TABLES', 'DESCRIBE teams', 'EXPLAIN SELECT 1', 'WITH t AS (SELECT 1) SELECT * FROM t'])(
    'lets %s through to the connection',
    async (sql) => {
      const deps = createTestDeps();

      // No MariaDB in CI: the statement passes the guard and fails on connection instead, which is the proof it was not rejected upfront.
      await expect(execReadOnlyQuery(deps, row, sql)).rejects.toThrow(ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED);
    }
  );

  it('accepts a trailing semicolon', async () => {
    const deps = createTestDeps();

    await expect(execReadOnlyQuery(deps, row, 'SELECT 1;')).rejects.toThrow(ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED);
  });
});
