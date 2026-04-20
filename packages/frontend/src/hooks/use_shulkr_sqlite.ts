import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
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
import { initSqlJsFromBuffer, type SqliteState } from '@shulkr/frontend/hooks/use_sqlite';

export function useShulkrSqlite() {
  const [state, setState] = useState<SqliteState>({ status: 'idle' });
  const [fileSize, setFileSize] = useState<number>(0);
  const [sizeWarningAccepted, setSizeWarningAccepted] = useState(false);
  const dbRef = useRef<SqlJsDatabase | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const load = useCallback(async () => {
    try {
      setState({ status: 'loading', message: 'Fetching database info...' });
      const infoRes = await apiClient.settings.getDatabaseInfo();
      if (infoRes.status !== 200) raise(infoRes.body, infoRes.status);
      setFileSize(infoRes.body.size);
      if (infoRes.body.size > MAX_FILE_SIZE && !sizeWarningAccepted) {
        setState({ status: 'idle' });
        return;
      }
      setState({ status: 'loading', message: 'Downloading database...' });
      const downloadParams = new URLSearchParams({ token: accessToken ?? '' });
      const downloadRes = await fetch(`/api/settings/database/download?${downloadParams.toString()}`);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download database: ${downloadRes.statusText}`);
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
  }, [accessToken, sizeWarningAccepted]);
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
