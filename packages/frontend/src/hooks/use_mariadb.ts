import { useState, useEffect, useCallback } from 'react';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import type {
  TableInfo,
  TableSchemaResult,
  TableDataResult,
  QueryResult,
  ColumnFilter,
  GlobalSearchMatch,
} from '@shulkr/frontend/hooks/sqlite_queries';

type MariadbState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'ready' }
  | { status: 'error'; error: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// Same surface as useSqlite, backed by the panel API instead of a WebAssembly copy of the file. A MariaDB database is queried where it lives: it is never downloaded to be read, which keeps the browser usable on a database far larger than the browser could hold.
export function useMariadb(databaseId: number, sizeBytes: number | null) {
  const [state, setState] = useState<MariadbState>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading', message: 'Connecting to the database...' });

    try {
      const result = await apiClient.databases.tables({ params: { id: databaseId } });
      if (result.status !== 200) raise(result.body, result.status);

      setState({ status: 'ready' });
    } catch (error: unknown) {
      setState({ status: 'error', error: messageOf(error) });
    }
  }, [databaseId]);

  useEffect(() => {
    load();
  }, [load]);

  const getTables = useCallback(async (): Promise<Array<TableInfo>> => {
    const result = await apiClient.databases.tables({ params: { id: databaseId } });
    if (result.status !== 200) raise(result.body, result.status);

    return result.body.tables;
  }, [databaseId]);

  const getTableSchema = useCallback(
    async (table: string): Promise<TableSchemaResult> => {
      const result = await apiClient.databases.tableSchema({ params: { id: databaseId, table } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    [databaseId]
  );

  const getTableData = useCallback(
    async (
      table: string,
      page: number,
      pageSize: number,
      orderBy?: string,
      direction?: 'ASC' | 'DESC',
      filters?: Array<ColumnFilter>
    ): Promise<TableDataResult> => {
      const result = await apiClient.databases.tableData({
        params: { id: databaseId, table },
        body: { page, pageSize, orderBy, direction, filters: filters ?? [] },
      });

      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    [databaseId]
  );

  const exec = useCallback(
    async (sql: string): Promise<QueryResult> => {
      const result = await apiClient.databases.query({ params: { id: databaseId }, body: { sql } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    [databaseId]
  );

  const globalSearch = useCallback(
    async (term: string, tables: Array<TableInfo>): Promise<Array<GlobalSearchMatch>> => {
      const result = await apiClient.databases.search({
        params: { id: databaseId },
        body: { term, tables: tables.map((table) => table.name) },
      });

      if (result.status !== 200) raise(result.body, result.status);

      return result.body.matches;
    },
    [databaseId]
  );

  const reload = useCallback(() => {
    load();
  }, [load]);

  // The size gate exists for the SQLite viewer, which downloads the whole file into the browser. Nothing is downloaded here, so there is nothing to warn about.
  const acceptSizeWarning = useCallback(() => {}, []);

  return {
    state,
    fileSize: sizeBytes ?? 0,
    needsSizeWarning: false,
    acceptSizeWarning,
    getTables,
    getTableSchema,
    getTableData,
    exec,
    globalSearch,
    reload,
  };
}
