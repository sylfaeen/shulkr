import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export type TableInfo = {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
};

export type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: string | null;
};

export type ForeignKeyInfo = {
  from: string;
  table: string;
  to: string;
};

export type TableSchemaResult = {
  columns: Array<ColumnInfo>;
  foreignKeys: Array<ForeignKeyInfo>;
};

export type QueryResult = {
  columns: Array<string>;
  rows: Array<Array<unknown>>;
  rowCount: number;
  time: number;
};

export type TableDataResult = QueryResult & {
  totalRows: number;
  page: number;
  pageSize: number;
};

export type GlobalSearchMatch = {
  table: string;
  columns: Array<string>;
  rows: Array<Array<unknown>>;
  matchCount: number;
};

type SqliteState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'ready' }
  | { status: 'error'; error: string };

type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: Array<string>; values: Array<Array<unknown>> }>;
  close: () => void;
};

const SQLITE_MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

function isSqliteBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false;
  const header = new Uint8Array(buffer, 0, 16);
  return SQLITE_MAGIC.every((byte, i) => header[i] === byte);
}

function queryTables(db: SqlJsDatabase): Array<TableInfo> {
  const result = db.exec(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const name = row[0] as string;
    const type = row[1] as 'table' | 'view';
    let rowCount = 0;
    try {
      const countResult = db.exec(`SELECT COUNT(*) FROM "${name}"`);
      if (countResult.length > 0) {
        rowCount = countResult[0].values[0][0] as number;
      }
    } catch {
      // Table might be corrupted
    }
    return { name, type, rowCount };
  });
}

function queryTableSchema(db: SqlJsDatabase, table: string): TableSchemaResult {
  const columnsResult = db.exec(`PRAGMA table_info("${table}")`);
  const columns: Array<ColumnInfo> =
    columnsResult.length > 0
      ? columnsResult[0].values.map((row) => ({
          cid: row[0] as number,
          name: row[1] as string,
          type: (row[2] as string) || 'TEXT',
          notnull: row[3] === 1,
          dflt_value: row[4] as string | null,
          pk: (row[5] as number) > 0,
        }))
      : [];

  const fkResult = db.exec(`PRAGMA foreign_key_list("${table}")`);
  const foreignKeys: Array<ForeignKeyInfo> =
    fkResult.length > 0
      ? fkResult[0].values.map((row) => ({
          table: row[2] as string,
          from: row[3] as string,
          to: row[4] as string,
        }))
      : [];

  return { columns, foreignKeys };
}

export type ColumnFilter = {
  column: string;
  value: string;
};

function buildWhereClause(filters: Array<ColumnFilter>): string {
  const active = filters.filter((f) => f.value.trim() !== '');
  if (active.length === 0) return '';
  const conditions = active.map((f) => `"${f.column}" LIKE '%' || '${f.value.replace(/'/g, "''")}' || '%'`);
  return `WHERE ${conditions.join(' AND ')}`;
}

function queryTableData(
  db: SqlJsDatabase,
  table: string,
  page: number,
  pageSize: number,
  orderBy?: string,
  direction: 'ASC' | 'DESC' = 'ASC',
  filters: Array<ColumnFilter> = []
): TableDataResult {
  const start = performance.now();
  const whereClause = buildWhereClause(filters);

  const countResult = db.exec(`SELECT COUNT(*) FROM "${table}" ${whereClause}`);
  const totalRows = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

  const offset = (page - 1) * pageSize;
  const orderClause = orderBy ? `ORDER BY "${orderBy}" ${direction}` : '';
  const result = db.exec(`SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`);

  const time = performance.now() - start;

  if (result.length === 0) {
    const schema = queryTableSchema(db, table);
    return {
      columns: schema.columns.map((c) => c.name),
      rows: [],
      rowCount: 0,
      totalRows,
      page,
      pageSize,
      time,
    };
  }

  return {
    columns: result[0].columns,
    rows: result[0].values as Array<Array<unknown>>,
    rowCount: result[0].values.length,
    totalRows,
    page,
    pageSize,
    time,
  };
}

function queryExec(db: SqlJsDatabase, sql: string): QueryResult {
  const start = performance.now();

  const forbidden = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REINDEX|VACUUM)\b/i;
  if (forbidden.test(sql)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const result = db.exec(sql);
  const time = performance.now() - start;

  if (result.length === 0) {
    return { columns: [], rows: [], rowCount: 0, time };
  }

  const last = result[result.length - 1];
  return {
    columns: last.columns,
    rows: last.values as Array<Array<unknown>>,
    rowCount: last.values.length,
    time,
  };
}

function queryGlobalSearch(db: SqlJsDatabase, term: string, tables: Array<TableInfo>): Array<GlobalSearchMatch> {
  const escaped = term.replace(/'/g, "''");
  const results: Array<GlobalSearchMatch> = [];

  for (const table of tables) {
    try {
      const schemaResult = db.exec(`PRAGMA table_info("${table.name}")`);
      if (schemaResult.length === 0) continue;

      const textColumns = schemaResult[0].values
        .filter((row) => {
          const colType = (row[2] as string).toUpperCase();
          return colType.includes('TEXT') || colType.includes('VARCHAR') || colType.includes('CHAR') || colType === '';
        })
        .map((row) => row[1] as string);

      if (textColumns.length === 0) continue;

      const conditions = textColumns.map((col) => `"${col}" LIKE '%${escaped}%'`).join(' OR ');
      const result = db.exec(`SELECT * FROM "${table.name}" WHERE ${conditions} LIMIT 50`);

      if (result.length > 0 && result[0].values.length > 0) {
        results.push({
          table: table.name,
          columns: result[0].columns,
          rows: result[0].values as Array<Array<unknown>>,
          matchCount: result[0].values.length,
        });
      }
    } catch {
      // Skip tables that error
    }
  }

  return results;
}

export function useSqlite(serverId: string, filePath: string) {
  const [state, setState] = useState<SqliteState>({ status: 'idle' });
  const [fileSize, setFileSize] = useState<number>(0);
  const [sizeWarningAccepted, setSizeWarningAccepted] = useState(false);

  const dbRef = useRef<SqlJsDatabase | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const load = useCallback(async () => {
    try {
      setState({ status: 'loading', message: 'Fetching file info...' });

      const infoParams = new URLSearchParams({ path: filePath });
      const infoRes = await fetch(`/api/servers/${serverId}/files/info?${infoParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!infoRes.ok) {
        throw new Error(`Failed to fetch file info: ${infoRes.statusText}`);
      }

      const info = (await infoRes.json()) as { size: number };
      setFileSize(info.size);

      if (info.size > MAX_FILE_SIZE && !sizeWarningAccepted) {
        setState({ status: 'idle' });
        return;
      }

      setState({ status: 'loading', message: 'Downloading database...' });

      const downloadParams = new URLSearchParams({ path: filePath, token: accessToken ?? '' });
      const downloadRes = await fetch(`/api/servers/${serverId}/files/download?${downloadParams.toString()}`);

      if (!downloadRes.ok) {
        throw new Error(`Failed to download file: ${downloadRes.statusText}`);
      }

      const buffer = await downloadRes.arrayBuffer();

      if (!isSqliteBuffer(buffer)) {
        setState({ status: 'error', error: 'NOT_SQLITE' });
        return;
      }

      setState({ status: 'loading', message: 'Initializing database...' });

      // sql.js has inconsistent exports across environments — resolve the init function robustly
      const mod = await import('sql.js');
      type InitFn = (config: {
        locateFile: (file: string) => string;
      }) => Promise<{ Database: new (data: Uint8Array) => SqlJsDatabase }>;
      const initSqlJs: InitFn =
        typeof mod === 'function'
          ? (mod as unknown as InitFn)
          : typeof mod.default === 'function'
            ? (mod.default as InitFn)
            : (mod.default as { default: InitFn }).default;

      const SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
      });

      if (dbRef.current) {
        dbRef.current.close();
      }

      dbRef.current = new SQL.Database(new Uint8Array(buffer));
      setState({ status: 'ready' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ status: 'error', error: message });
    }
  }, [serverId, filePath, accessToken, sizeWarningAccepted]);

  useEffect(() => {
    load();

    return () => {
      if (dbRef.current) {
        dbRef.current.close();
        dbRef.current = null;
      }
    };
  }, [load]);

  const getTables = useCallback((): Promise<Array<TableInfo>> => {
    if (!dbRef.current) return Promise.reject(new Error('No database loaded'));
    return Promise.resolve(queryTables(dbRef.current));
  }, []);

  const getTableSchema = useCallback((table: string): Promise<TableSchemaResult> => {
    if (!dbRef.current) return Promise.reject(new Error('No database loaded'));
    return Promise.resolve(queryTableSchema(dbRef.current, table));
  }, []);

  const getTableData = useCallback(
    (
      table: string,
      page: number,
      pageSize: number,
      orderBy?: string,
      direction?: 'ASC' | 'DESC',
      filters?: Array<ColumnFilter>
    ): Promise<TableDataResult> => {
      if (!dbRef.current) return Promise.reject(new Error('No database loaded'));
      return Promise.resolve(queryTableData(dbRef.current, table, page, pageSize, orderBy, direction, filters));
    },
    []
  );

  const exec = useCallback((sql: string): Promise<QueryResult> => {
    if (!dbRef.current) return Promise.reject(new Error('No database loaded'));
    return Promise.resolve(queryExec(dbRef.current, sql));
  }, []);

  const globalSearch = useCallback((term: string, tables: Array<TableInfo>): Promise<Array<GlobalSearchMatch>> => {
    if (!dbRef.current) return Promise.reject(new Error('No database loaded'));
    return Promise.resolve(queryGlobalSearch(dbRef.current, term, tables));
  }, []);

  const reload = useCallback(() => {
    if (dbRef.current) {
      dbRef.current.close();
      dbRef.current = null;
    }
    load();
  }, [load]);

  const acceptSizeWarning = useCallback(() => {
    setSizeWarningAccepted(true);
  }, []);

  const needsSizeWarning = state.status === 'idle' && fileSize > MAX_FILE_SIZE && !sizeWarningAccepted;

  return {
    state,
    fileSize,
    needsSizeWarning,
    acceptSizeWarning,
    getTables,
    getTableSchema,
    getTableData,
    exec,
    globalSearch,
    reload,
  };
}
