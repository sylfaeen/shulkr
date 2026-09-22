import mysql from 'mysql2/promise';
import { ErrorCodes } from '@shulkr/shared';
import type {
  DatabaseColumnFilter,
  DatabaseQueryResult,
  DatabaseTableDataResult,
  DatabaseTableInfo,
  DatabaseTableSchema,
} from '@shulkr/shared';
import type { ServerDatabaseRow } from '@shulkr/backend/db/schema';
import { cipherDecrypt } from '@shulkr/backend/services/encryption_service';
import { DATABASE_HOST_LOCAL, DATABASE_PORT } from '@shulkr/backend/services/database_engine_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'encryption' | 'clock' | 'config'>;

const MAX_ROWS = 500;
const STATEMENT_TIMEOUT_MS = 10_000;

// The browser connects with the plugin's own user, the one whose password the panel already holds and can reveal. What makes the session safe is not that user but the read-only transaction below, which MariaDB enforces itself: every INSERT, UPDATE, DELETE and DDL is refused by the server, whatever the query text says.
async function withReadOnlyConnection<T>(
  deps: Deps,
  row: ServerDatabaseRow,
  run: (connection: mysql.Connection) => Promise<T>
): Promise<T> {
  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection({
      host: DATABASE_HOST_LOCAL,
      port: DATABASE_PORT,
      user: row.db_user,
      password: cipherDecrypt(deps, row.password_encrypted),
      database: row.db_name,
      connectTimeout: 5_000,
      multipleStatements: false,
      dateStrings: true,
    });

    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query(`SET SESSION max_statement_time = ${STATEMENT_TIMEOUT_MS / 1000}`);

    return await run(connection);
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('ER_')) {
      throw new Error(`${ErrorCodes.DATABASE_QUERY_FAILED}: ${error.message}`, { cause: error });
    }

    if (error instanceof Error && error.message.startsWith(ErrorCodes.DATABASE_QUERY_FAILED)) throw error;

    throw new Error(ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED, { cause: error });
  } finally {
    if (connection) await connection.end().catch(() => undefined);
  }
}

function toRows(
  fields: Array<mysql.FieldPacket>,
  rows: Array<mysql.RowDataPacket>
): { columns: Array<string>; rows: Array<Array<unknown>> } {
  const columns = fields.map((field) => field.name);

  return {
    columns,
    rows: rows.map((row) => columns.map((column) => normalizeValue(row[column]))),
  };
}

// Buffers (BLOB, BINARY) and dates would serialize into shapes the table renderer cannot display.
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex').slice(0, 64)}`;
  if (value instanceof Date) return value.toISOString();

  return value;
}

export async function listDatabaseTables(deps: Deps, row: ServerDatabaseRow): Promise<Array<DatabaseTableInfo>> {
  return withReadOnlyConnection(deps, row, async (connection) => {
    const [rows] = await connection.query<Array<mysql.RowDataPacket>>(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, COALESCE(TABLE_ROWS, 0) AS rowCount
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [row.db_name]
    );

    return rows.map((entry) => ({
      name: String(entry.name),
      type: entry.type === 'VIEW' ? ('view' as const) : ('table' as const),
      rowCount: Number(entry.rowCount ?? 0),
    }));
  });
}

export async function readTableSchema(deps: Deps, row: ServerDatabaseRow, table: string): Promise<DatabaseTableSchema> {
  return withReadOnlyConnection(deps, row, async (connection) => {
    const [columns] = await connection.query<Array<mysql.RowDataPacket>>(
      `SELECT ORDINAL_POSITION AS cid, COLUMN_NAME AS name, COLUMN_TYPE AS type,
              IS_NULLABLE AS nullable, COLUMN_KEY AS columnKey, COLUMN_DEFAULT AS defaultValue
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [row.db_name, table]
    );

    const [foreignKeys] = await connection.query<Array<mysql.RowDataPacket>>(
      `SELECT COLUMN_NAME AS "from", REFERENCED_TABLE_NAME AS "table", REFERENCED_COLUMN_NAME AS "to"
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [row.db_name, table]
    );

    return {
      columns: columns.map((column) => ({
        cid: Number(column.cid),
        name: String(column.name),
        type: String(column.type),
        notnull: column.nullable === 'NO',
        pk: column.columnKey === 'PRI',
        dflt_value: column.defaultValue === null ? null : String(column.defaultValue),
      })),
      foreignKeys: foreignKeys.map((key) => ({
        from: String(key.from),
        table: String(key.table),
        to: String(key.to),
      })),
    };
  });
}

// Table and column names cannot be bound as parameters, so every identifier is matched against what the schema actually holds before it reaches a query. A name that is not in that list is rejected rather than escaped.
async function assertKnownTable(connection: mysql.Connection, schema: string, table: string): Promise<Array<string>> {
  const [rows] = await connection.query<Array<mysql.RowDataPacket>>(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [schema, table]
  );

  if (rows.length === 0) throw new Error(`${ErrorCodes.DATABASE_QUERY_FAILED}: unknown table`);

  return rows.map((entry) => String(entry.name));
}

function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

export async function readTableData(
  deps: Deps,
  row: ServerDatabaseRow,
  input: {
    table: string;
    page: number;
    pageSize: number;
    orderBy?: string;
    direction?: 'ASC' | 'DESC';
    filters?: Array<DatabaseColumnFilter>;
  }
): Promise<DatabaseTableDataResult> {
  return withReadOnlyConnection(deps, row, async (connection) => {
    const started = deps.clock().getTime();
    const columns = await assertKnownTable(connection, row.db_name, input.table);
    const pageSize = Math.min(Math.max(input.pageSize, 1), MAX_ROWS);
    const page = Math.max(input.page, 1);

    const filters = (input.filters ?? []).filter((filter) => columns.includes(filter.column));

    const where =
      filters.length > 0 ? `WHERE ${filters.map((filter) => `${quoteIdentifier(filter.column)} LIKE ?`).join(' AND ')}` : '';

    const params = filters.map((filter) => `%${filter.value}%`);

    const order =
      input.orderBy && columns.includes(input.orderBy)
        ? `ORDER BY ${quoteIdentifier(input.orderBy)} ${input.direction === 'DESC' ? 'DESC' : 'ASC'}`
        : '';

    const [countRows] = await connection.query<Array<mysql.RowDataPacket>>(
      `SELECT COUNT(*) AS total FROM ${quoteIdentifier(input.table)} ${where}`,
      params
    );

    const [rows, fields] = await connection.query<Array<mysql.RowDataPacket>>(
      `SELECT * FROM ${quoteIdentifier(input.table)} ${where} ${order} LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    const result = toRows(fields, rows);

    return {
      ...result,
      rowCount: result.rows.length,
      time: deps.clock().getTime() - started,
      totalRows: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  });
}

// The read-only transaction is what actually prevents writes. This check exists so that a mistyped UPDATE fails with a message the reader understands instead of a raw server error.
function assertReadOnlyStatement(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '');

  if (trimmed.includes(';')) throw new Error(`${ErrorCodes.DATABASE_QUERY_FAILED}: only one statement at a time`);

  if (!/^(select|show|describe|desc|explain|with)\b/i.test(trimmed)) {
    throw new Error(`${ErrorCodes.DATABASE_QUERY_FAILED}: read-only queries only`);
  }
}

export async function execReadOnlyQuery(deps: Deps, row: ServerDatabaseRow, sql: string): Promise<DatabaseQueryResult> {
  assertReadOnlyStatement(sql);

  return withReadOnlyConnection(deps, row, async (connection) => {
    const started = deps.clock().getTime();
    const [rows, fields] = await connection.query<Array<mysql.RowDataPacket>>(sql);
    const result = Array.isArray(rows) ? toRows(fields ?? [], rows.slice(0, MAX_ROWS)) : { columns: [], rows: [] };

    return {
      ...result,
      rowCount: result.rows.length,
      time: deps.clock().getTime() - started,
    };
  });
}

export async function searchAcrossTables(
  deps: Deps,
  row: ServerDatabaseRow,
  term: string,
  tables: Array<string>
): Promise<Array<{ table: string; columns: Array<string>; rows: Array<Array<unknown>>; matchCount: number }>> {
  if (term.trim().length < 2) return [];

  return withReadOnlyConnection(deps, row, async (connection) => {
    const matches: Array<{ table: string; columns: Array<string>; rows: Array<Array<unknown>>; matchCount: number }> = [];

    for (const table of tables.slice(0, 30)) {
      const columns = await assertKnownTable(connection, row.db_name, table).catch(() => []);
      if (columns.length === 0) continue;

      const where = columns.map((column) => `CAST(${quoteIdentifier(column)} AS CHAR) LIKE ?`).join(' OR ');
      const params = columns.map(() => `%${term}%`);

      const [rows, fields] = await connection.query<Array<mysql.RowDataPacket>>(
        `SELECT * FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT 20`,
        params
      );

      if (rows.length === 0) continue;

      const result = toRows(fields, rows);
      matches.push({ table, columns: result.columns, rows: result.rows, matchCount: result.rows.length });
    }

    return matches;
  });
}
