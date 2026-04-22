import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  type SqlJsDatabase,
  type TableInfo,
  type TableSchemaResult,
  type TableDataResult,
  type QueryResult,
  type ColumnFilter,
  type GlobalSearchMatch,
  MAX_FILE_SIZE,
  isSqliteBuffer,
  queryTables,
  queryTableSchema,
  queryTableData,
  queryExec,
  queryGlobalSearch,
} from '@shulkr/frontend/hooks/sqlite_queries';

export type {
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  TableSchemaResult,
  QueryResult,
  TableDataResult,
  ColumnFilter,
  GlobalSearchMatch,
} from '@shulkr/frontend/hooks/sqlite_queries';

export type SqliteHandle = ReturnType<typeof useSqlite>;

type SqliteState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'ready' }
  | { status: 'error'; error: string };

export type { SqliteState };

export function initSqlJsFromBuffer(buffer: ArrayBuffer) {
  return async function init(): Promise<SqlJsDatabase> {
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
    return new SQL.Database(new Uint8Array(buffer));
  };
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
      const init = initSqlJsFromBuffer(buffer);
      const db = await init();
      if (dbRef.current) {
        dbRef.current.close();
      }
      dbRef.current = db;
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
