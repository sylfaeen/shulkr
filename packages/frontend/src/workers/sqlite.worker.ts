import initSqlJs, { type Database } from 'sql.js';

let db: Database | null = null;

type WorkerRequest =
  | { id: number; type: 'open'; buffer: ArrayBuffer }
  | { id: number; type: 'getTables' }
  | { id: number; type: 'getTableSchema'; table: string }
  | {
      id: number;
      type: 'getTableData';
      table: string;
      page: number;
      pageSize: number;
      orderBy?: string;
      direction?: 'ASC' | 'DESC';
    }
  | { id: number; type: 'exec'; sql: string }
  | { id: number; type: 'close' };

type TableInfo = {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
};

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: string | null;
};

type ForeignKeyInfo = {
  from: string;
  table: string;
  to: string;
};

type TableSchemaResult = {
  columns: Array<ColumnInfo>;
  foreignKeys: Array<ForeignKeyInfo>;
};

type QueryResult = {
  columns: Array<string>;
  rows: Array<Array<unknown>>;
  rowCount: number;
  time: number;
};

type TableDataResult = QueryResult & {
  totalRows: number;
  page: number;
  pageSize: number;
};

function handleOpen(buffer: ArrayBuffer) {
  if (db) {
    db.close();
  }
  const SQL = initSqlJsSync();
  db = new SQL.Database(new Uint8Array(buffer));
}

let sqlJsModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSqlJsAsync() {
  if (!sqlJsModule) {
    sqlJsModule = await initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }
  return sqlJsModule;
}

function initSqlJsSync() {
  if (!sqlJsModule) {
    throw new Error('sql.js not initialized');
  }
  return sqlJsModule;
}

function requireDb(): Database {
  if (!db) {
    throw new Error('No database loaded');
  }
  return db;
}

function handleGetTables(): Array<TableInfo> {
  const database = requireDb();
  const result = database.exec(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const name = row[0] as string;
    const type = row[1] as 'table' | 'view';
    let rowCount = 0;
    try {
      const countResult = database.exec(`SELECT COUNT(*) FROM "${name}"`);
      if (countResult.length > 0) {
        rowCount = countResult[0].values[0][0] as number;
      }
    } catch {
      // Table might be corrupted, skip count
    }
    return { name, type, rowCount };
  });
}

function handleGetTableSchema(table: string): TableSchemaResult {
  const database = requireDb();

  const columnsResult = database.exec(`PRAGMA table_info("${table}")`);
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

  const fkResult = database.exec(`PRAGMA foreign_key_list("${table}")`);
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

function handleGetTableData(
  table: string,
  page: number,
  pageSize: number,
  orderBy?: string,
  direction: 'ASC' | 'DESC' = 'ASC'
): TableDataResult {
  const database = requireDb();
  const start = performance.now();

  const countResult = database.exec(`SELECT COUNT(*) FROM "${table}"`);
  const totalRows = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

  const offset = (page - 1) * pageSize;
  const orderClause = orderBy ? `ORDER BY "${orderBy}" ${direction}` : '';
  const result = database.exec(`SELECT * FROM "${table}" ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`);

  const time = performance.now() - start;

  if (result.length === 0) {
    const schema = handleGetTableSchema(table);
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

function handleExec(sql: string): QueryResult {
  const database = requireDb();
  const start = performance.now();

  const forbidden = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REINDEX|VACUUM)\b/i;
  if (forbidden.test(sql)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const result = database.exec(sql);
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

function handleClose() {
  if (db) {
    db.close();
    db = null;
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type } = e.data;

  try {
    switch (type) {
      case 'open': {
        await initSqlJsAsync();
        handleOpen(e.data.buffer);
        self.postMessage({ id, success: true });
        break;
      }
      case 'getTables': {
        const tables = handleGetTables();
        self.postMessage({ id, success: true, data: tables });
        break;
      }
      case 'getTableSchema': {
        const schema = handleGetTableSchema(e.data.table);
        self.postMessage({ id, success: true, data: schema });
        break;
      }
      case 'getTableData': {
        const data = handleGetTableData(e.data.table, e.data.page, e.data.pageSize, e.data.orderBy, e.data.direction);
        self.postMessage({ id, success: true, data });
        break;
      }
      case 'exec': {
        const result = handleExec(e.data.sql);
        self.postMessage({ id, success: true, data: result });
        break;
      }
      case 'close': {
        handleClose();
        self.postMessage({ id, success: true });
        break;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ id, success: false, error: message });
  }
};
