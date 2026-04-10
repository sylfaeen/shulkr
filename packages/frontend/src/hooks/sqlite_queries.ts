export type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: Array<string>; values: Array<Array<unknown>> }>;
  close: () => void;
};

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

export type ColumnFilter = {
  column: string;
  value: string;
};

export const SQLITE_MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function isSqliteBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false;
  const header = new Uint8Array(buffer, 0, 16);
  return SQLITE_MAGIC.every((byte, i) => header[i] === byte);
}

export function queryTables(db: SqlJsDatabase): Array<TableInfo> {
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

export function queryTableSchema(db: SqlJsDatabase, table: string): TableSchemaResult {
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

function buildWhereClause(filters: Array<ColumnFilter>): string {
  const active = filters.filter((f) => f.value.trim() !== '');
  if (active.length === 0) return '';
  const conditions = active.map((f) => `"${f.column}" LIKE '%' || '${f.value.replace(/'/g, "''")}' || '%'`);
  return `WHERE ${conditions.join(' AND ')}`;
}

export function queryTableData(
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

export function queryExec(db: SqlJsDatabase, sql: string): QueryResult {
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

export function queryGlobalSearch(db: SqlJsDatabase, term: string, tables: Array<TableInfo>): Array<GlobalSearchMatch> {
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
