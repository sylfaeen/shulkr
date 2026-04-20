import { useState, useEffect, useCallback, useRef, type KeyboardEvent, PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileDown,
  Filter,
  History,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Terminal,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import {
  type SqliteHandle,
  type TableInfo,
  type TableSchemaResult,
  type TableDataResult,
  type QueryResult,
  type ColumnFilter,
  type GlobalSearchMatch,
} from '@shulkr/frontend/hooks/use_sqlite';
import { formatFileSize } from '@shulkr/frontend/hooks/use_files';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { cn } from '@shulkr/frontend/lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shulkr/frontend/features/ui/shadcn/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';

export function DbViewerContent({ sqlite, onDownload }: { sqlite: SqliteHandle; onDownload?: () => void }) {
  const { t } = useTranslation();
  const [tables, setTables] = useState<Array<TableInfo>>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableSchemaResult | null>(null);
  const [tableData, setTableData] = useState<TableDataResult | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [direction, setDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [filters, setFilters] = useState<Array<ColumnFilter>>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<GlobalSearchMatch> | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { getTables, getTableSchema, getTableData } = sqlite;
  // Load tables when ready
  useEffect(() => {
    if (sqlite.state.status !== 'ready') return;
    getTables().then((result) => {
      setTables(result);
    });
  }, [sqlite.state.status, getTables]);
  // Load table data when selection changes
  useEffect(() => {
    if (sqlite.state.status !== 'ready' || !selectedTable) return;
    setDataLoading(true);
    Promise.all([getTableSchema(selectedTable), getTableData(selectedTable, page, pageSize, orderBy, direction, filters)])
      .then(([schemaResult, dataResult]) => {
        setSchema(schemaResult);
        setTableData(dataResult);
        setDataLoading(false);
      })
      .catch(() => {
        setDataLoading(false);
      });
  }, [selectedTable, page, pageSize, orderBy, direction, filters, sqlite.state.status, getTableSchema, getTableData]);
  const handleSelectTable = useCallback((name: string) => {
    setSelectedTable(name);
    setPage(1);
    setOrderBy(undefined);
    setDirection('ASC');
    setFilters([]);
  }, []);
  const handleFilterChange = useCallback((column: string, value: string) => {
    setFilters((prev) => {
      const existing = prev.find((f) => f.column === column);
      if (existing) {
        if (value === '') return prev.filter((f) => f.column !== column);
        return prev.map((f) => (f.column === column ? { ...f, value } : f));
      }
      if (value === '') return prev;
      return [...prev, { column, value }];
    });
    setPage(1);
  }, []);
  const handleClearFilters = useCallback(() => {
    setFilters([]);
    setPage(1);
  }, []);
  const handleSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!term.trim()) {
        setSearchResults(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      searchTimeoutRef.current = setTimeout(() => {
        sqlite
          .globalSearch(term.trim(), tables)
          .then((results) => {
            setSearchResults(results);
            setSearching(false);
          })
          .catch(() => {
            setSearching(false);
          });
      }, 500);
    },
    [sqlite, tables]
  );
  const handleSort = useCallback(
    (column: string) => {
      setOrderBy((prev) => {
        if (prev === column) {
          if (direction === 'ASC') {
            setDirection('DESC');
            return column;
          }
          setDirection('ASC');
          return undefined;
        }
        setDirection('ASC');
        return column;
      });
      setPage(1);
    },
    [direction]
  );
  if (sqlite.needsSizeWarning) {
    return <SizeWarning fileSize={sqlite.fileSize} onAccept={sqlite.acceptSizeWarning} onDownload={() => onDownload?.()} />;
  }
  if (sqlite.state.status === 'loading') {
    return (
      <StatusCard>
        <LoaderCircle className={'size-6 animate-spin text-zinc-400'} strokeWidth={2} />
        <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{sqlite.state.message}</p>
      </StatusCard>
    );
  }
  if (sqlite.state.status === 'error') {
    const isNotSqlite = sqlite.state.error === 'NOT_SQLITE';
    return (
      <StatusCard>
        <AlertCircle className={'size-8 text-red-500'} strokeWidth={1.5} />
        <p className={'font-medium text-zinc-700 dark:text-zinc-300'}>
          {isNotSqlite ? t('files.dbViewer.notSqlite') : t('files.dbViewer.corrupt')}
        </p>
        <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{!isNotSqlite && sqlite.state.error}</p>
        <div className={'flex gap-2'}>
          {onDownload && (
            <Button variant={'secondary'} onClick={onDownload} icon={Download}>
              {t('files.download')}
            </Button>
          )}
          {!isNotSqlite && (
            <Button variant={'secondary'} onClick={sqlite.reload} icon={RefreshCw}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      </StatusCard>
    );
  }
  if (sqlite.state.status !== 'ready') {
    return (
      <StatusCard>
        <LoaderCircle className={'size-6 animate-spin text-zinc-400'} strokeWidth={2} />
      </StatusCard>
    );
  }
  if (tables.length === 0) {
    return (
      <StatusCard>
        <Database className={'size-8 text-zinc-400'} strokeWidth={1.5} />
        <p className={'font-medium text-zinc-700 dark:text-zinc-300'}>{t('files.dbViewer.emptyDb')}</p>
      </StatusCard>
    );
  }
  return (
    <div className={'flex min-h-0 flex-1 flex-col gap-4'}>
      <div className={'relative shrink-0'}>
        <Search className={'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400'} strokeWidth={2} />
        <input
          type={'text'}
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('files.dbViewer.searchPlaceholder')}
          className={
            'w-full rounded-xl border border-black/10 bg-white py-2.5 pr-4 pl-9 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-blue-500'
          }
        />
        {searching && (
          <LoaderCircle
            className={'absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-zinc-400'}
            strokeWidth={2}
          />
        )}
      </div>
      {searchResults !== null ? (
        <GlobalSearchResults
          results={searchResults}
          term={searchTerm}
          onSelectTable={(name) => {
            handleSelectTable(name);
            setSearchTerm('');
            setSearchResults(null);
          }}
        />
      ) : (
        <>
          <div
            className={
              'flex min-h-0 flex-1 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'
            }
          >
            <TableList onSelect={handleSelectTable} {...{ tables, selectedTable }} />
            <div className={'flex min-w-0 flex-1 flex-col overflow-hidden border-l border-black/10 dark:border-white/10'}>
              {selectedTable && schema && tableData ? (
                <DataTableView
                  tableName={selectedTable}
                  data={tableData}
                  exec={sqlite.exec}
                  onSort={handleSort}
                  onPageChange={setPage}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                  {...{ schema, orderBy, direction, dataLoading, filters }}
                />
              ) : selectedTable && dataLoading ? (
                <div className={'flex flex-1 items-center justify-center'}>
                  <LoaderCircle className={'size-5 animate-spin text-zinc-400'} strokeWidth={2} />
                </div>
              ) : (
                <DatabaseOverview fileSize={sqlite.fileSize} onSelectTable={handleSelectTable} {...{ tables }} />
              )}
            </div>
          </div>
          <SqlConsole exec={sqlite.exec} />
        </>
      )}
    </div>
  );
}

function GlobalSearchResults({
  results,
  term,
  onSelectTable,
}: {
  results: Array<GlobalSearchMatch>;
  term: string;
  onSelectTable: (name: string) => void;
}) {
  const { t } = useTranslation();
  if (results.length === 0) {
    return (
      <StatusCard>
        <Search className={'size-8 text-zinc-300 dark:text-zinc-600'} strokeWidth={1.5} />
        <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{t('files.dbViewer.noResults', { term })}</p>
      </StatusCard>
    );
  }
  const totalMatches = results.reduce((sum, r) => sum + r.matchCount, 0);
  return (
    <div className={'flex flex-col gap-3 overflow-y-auto'}>
      <p className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>
        <span className={'font-semibold text-zinc-600 dark:text-zinc-300'}>{totalMatches}</span>{' '}
        {totalMatches === 1 ? 'result' : 'results'} in{' '}
        <span className={'font-semibold text-zinc-600 dark:text-zinc-300'}>{results.length}</span>{' '}
        {results.length === 1 ? 'table' : 'tables'}
      </p>
      {results.map((match) => (
        <div
          key={match.table}
          className={'overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'}
        >
          <button
            onClick={() => onSelectTable(match.table)}
            className={
              'flex w-full items-center justify-between border-b border-black/10 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-zinc-800'
            }
          >
            <span className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{match.table}</span>
            <span className={'font-jetbrains text-xs text-zinc-400 tabular-nums'}>{match.matchCount} matches</span>
          </button>
          <div className={'max-h-48 overflow-auto'}>
            <table className={'w-full text-sm'}>
              <thead className={'sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800'}>
                <tr>
                  {match.columns.map((col) => (
                    <th
                      key={col}
                      className={
                        'border-b border-black/10 px-3 py-1.5 text-left text-xs font-medium whitespace-nowrap text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                      }
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {match.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={'border-b border-black/5 dark:border-white/5'}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className={'max-w-xs truncate px-3 py-1.5 whitespace-nowrap'}>
                        <HighlightedCell value={cell} {...{ term }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function HighlightedCell({ value, term }: { value: unknown; term: string }) {
  if (value === null) {
    return <span className={'font-jetbrains text-xs text-zinc-300 italic dark:text-zinc-600'}>NULL</span>;
  }
  const str = String(value);
  const lowerStr = str.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerStr.indexOf(lowerTerm);
  if (idx === -1) {
    return <span className={'font-jetbrains text-xs text-zinc-700 dark:text-zinc-300'}>{str}</span>;
  }
  return (
    <span className={'font-jetbrains text-xs text-zinc-700 dark:text-zinc-300'}>
      {str.substring(0, idx)}
      <mark className={'rounded bg-yellow-200 px-0.5 dark:bg-yellow-800'}>{str.substring(idx, idx + term.length)}</mark>
      {str.substring(idx + term.length)}
    </span>
  );
}

function StatusCard({ children }: PropsWithChildren) {
  return (
    <div
      className={
        'flex min-h-0 flex-1 items-center justify-center rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'
      }
    >
      <div className={'flex flex-col items-center gap-4 px-6 text-center'}>{children}</div>
    </div>
  );
}

function SizeWarning({ fileSize, onAccept, onDownload }: { fileSize: number; onAccept: () => void; onDownload: () => void }) {
  const { t } = useTranslation();
  return (
    <StatusCard>
      <AlertTriangle className={'size-8 text-amber-500'} strokeWidth={1.5} />
      <p className={'font-medium text-zinc-700 dark:text-zinc-300'}>{t('files.dbViewer.largeFile')}</p>
      <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>
        {t('files.dbViewer.largeFileDesc', {
          size: formatFileSize(fileSize),
        })}
      </p>
      <div className={'flex gap-2'}>
        <Button onClick={onAccept}>{t('files.dbViewer.loadAnyway')}</Button>
        <Button variant={'secondary'} onClick={onDownload} icon={Download}>
          {t('files.download')}
        </Button>
      </div>
    </StatusCard>
  );
}

function DatabaseOverview({
  tables,
  fileSize,
  onSelectTable,
}: {
  tables: Array<TableInfo>;
  fileSize: number;
  onSelectTable: (name: string) => void;
}) {
  const { t } = useTranslation();
  const tableCount = tables.filter((t) => t.type === 'table').length;
  const viewCount = tables.filter((t) => t.type === 'view').length;
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const sorted = [...tables].sort((a, b) => b.rowCount - a.rowCount);
  return (
    <div className={'flex flex-1 flex-col overflow-hidden'}>
      <div className={'flex min-h-10.5 items-center gap-4 border-b border-black/10 px-4 dark:border-white/10'}>
        <OverviewStat label={t('files.dbViewer.tables')} value={String(tableCount)} />
        <OverviewStat label={t('files.dbViewer.views')} value={String(viewCount)} />
        <OverviewStat label={t('files.dbViewer.totalRows')} value={totalRows.toLocaleString()} />
        <OverviewStat label={t('files.dbViewer.fileSize')} value={formatFileSize(fileSize)} />
      </div>
      <div className={'flex-1 overflow-y-auto'}>
        <table className={'w-full text-sm'}>
          <thead className={'sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800'}>
            <tr>
              <th
                className={
                  'border-b border-black/10 px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                }
              >
                {t('files.dbViewer.name')}
              </th>
              <th
                className={
                  'border-b border-black/10 px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                }
              >
                {t('files.dbViewer.type')}
              </th>
              <th
                className={
                  'border-b border-black/10 px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                }
              >
                {t('files.dbViewer.rows')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((table) => (
              <tr
                key={table.name}
                onClick={() => onSelectTable(table.name)}
                className={
                  'cursor-pointer border-b border-black/5 transition-colors hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-zinc-800/50'
                }
              >
                <td className={'px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300'}>{table.name}</td>
                <td className={'px-4 py-2'}>
                  <span
                    className={cn(
                      'font-jetbrains rounded px-1.5 py-0.5 text-xs',
                      table.type === 'table'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                    )}
                  >
                    {table.type}
                  </span>
                </td>
                <td className={'font-jetbrains px-4 py-2 text-right text-zinc-500 tabular-nums dark:text-zinc-400'}>
                  {table.rowCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex items-center gap-1.5'}>
      <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{label}</span>
      <span className={'font-jetbrains text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300'}>{value}</span>
    </div>
  );
}

function TableList({
  tables,
  selectedTable,
  onSelect,
}: {
  tables: Array<TableInfo>;
  selectedTable: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className={'flex w-52 shrink-0 flex-col overflow-hidden'}>
      <div className={'flex min-h-10.5 items-center justify-start border-b border-black/10 px-4 dark:border-white/10'}>
        <h3 className={'text-[11px] font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500'}>
          Tables
          <span className={'ml-1.5 text-zinc-300 dark:text-zinc-600'}>{tables.length}</span>
        </h3>
      </div>
      <div className={'flex-1 overflow-y-auto'}>
        {tables.map((table) => {
          const isActive = selectedTable === table.name;
          return (
            <button
              key={table.name}
              onClick={() => onSelect(table.name)}
              className={cn(
                'relative flex w-full items-center justify-between gap-2 border-b border-black/5 py-2.5 pr-4 pl-4 text-left transition-colors last:border-b-0 dark:border-white/5',
                isActive ? 'bg-zinc-50 dark:bg-zinc-800/80' : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40'
              )}
            >
              {isActive && (
                <span
                  className={'absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-zinc-900 dark:bg-zinc-100'}
                />
              )}
              <span
                className={cn(
                  'truncate text-sm',
                  isActive ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
                )}
              >
                {table.name}
              </span>
              <span className={'font-jetbrains shrink-0 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500'}>
                {table.rowCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataTableView({
  tableName,
  schema,
  data,
  orderBy,
  direction,
  dataLoading,
  filters,
  exec,
  onSort,
  onPageChange,
  onFilterChange,
  onClearFilters,
}: {
  tableName: string;
  schema: TableSchemaResult;
  data: TableDataResult;
  orderBy: string | undefined;
  direction: 'ASC' | 'DESC';
  dataLoading: boolean;
  filters: Array<ColumnFilter>;
  exec: (sql: string) => Promise<QueryResult>;
  onSort: (column: string) => void;
  onPageChange: (page: number) => void;
  onFilterChange: (column: string, value: string) => void;
  onClearFilters: () => void;
}) {
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const [rawMode, setRawMode] = useState(true);
  const totalPages = Math.ceil(data.totalRows / data.pageSize);
  const fetchAllRows = useCallback(async () => {
    const result = await exec(`SELECT * FROM "${tableName}"`);
    return { columns: result.columns, rows: result.rows };
  }, [exec, tableName]);
  return (
    <div className={'flex flex-1 flex-col overflow-hidden'}>
      <div className={'flex min-h-[41.5px] items-center justify-end gap-1 border-b border-black/10 px-3 dark:border-white/10'}>
        <TooltipProvider delayDuration={300}>
          <div className={'flex shrink-0 items-center gap-1'}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={'ghost'}
                  size={'icon-sm'}
                  aria-label={t('files.dbViewer.raw')}
                  onClick={() => setRawMode((v) => !v)}
                  className={cn(rawMode && 'text-blue-500')}
                >
                  {rawMode ? <ToggleRight className={'size-4'} /> : <ToggleLeft className={'size-4'} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('files.dbViewer.raw')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={'ghost'}
                  size={'icon-sm'}
                  aria-label={t('files.dbViewer.filter')}
                  onClick={() => {
                    if (showFilters && filters.length > 0) onClearFilters();
                    setShowFilters((v) => !v);
                  }}
                  className={cn(filters.length > 0 && 'text-blue-500')}
                  icon={Filter}
                  iconClass={'size-3.5'}
                >
                  {filters.length > 0 && (
                    <span
                      className={
                        'absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white'
                      }
                    >
                      {filters.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('files.dbViewer.filter')}</TooltipContent>
            </Tooltip>
            <ExportButton columns={data.columns} rows={data.rows} filename={tableName} fetchAll={fetchAllRows} />
            <span
              className={
                'font-jetbrains ml-2 border-l border-black/10 pl-2 text-[11px] text-zinc-400 tabular-nums dark:border-white/10 dark:text-zinc-500'
              }
            >
              {data.totalRows.toLocaleString()} rows &middot; {data.time.toFixed(1)}ms
            </span>
          </div>
        </TooltipProvider>
      </div>
      <div className={cn('flex-1 overflow-auto', dataLoading && 'opacity-50')}>
        <table className={'w-full text-sm'}>
          <thead className={'sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800'}>
            <tr>
              <TooltipProvider delayDuration={300}>
                {data.columns.map((col) => {
                  const colSchema = schema.columns.find((c) => c.name === col);
                  const tooltipText = colSchema
                    ? `${colSchema.type}${colSchema.pk ? ' · Primary Key' : ''}${colSchema.notnull ? ' · NOT NULL' : ''}`
                    : col;
                  return (
                    <Tooltip key={col}>
                      <TooltipTrigger asChild>
                        <th
                          scope={'col'}
                          aria-sort={orderBy === col ? (direction === 'ASC' ? 'ascending' : 'descending') : undefined}
                          onClick={() => onSort(col)}
                          className={
                            'cursor-pointer border-b border-black/10 px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-zinc-500 transition-colors select-none hover:text-zinc-700 dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }
                        >
                          {col}
                          {orderBy === col && <span className={'ml-1'}>{direction === 'ASC' ? '\u2191' : '\u2193'}</span>}
                        </th>
                      </TooltipTrigger>
                      <TooltipContent className={'font-jetbrains'}>{tooltipText}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </tr>
            {showFilters && (
              <tr>
                {data.columns.map((col) => (
                  <th key={`filter-${col}`} className={'border-b border-black/10 px-2 py-1.5 dark:border-white/10'}>
                    <input
                      type={'text'}
                      value={filters.find((f) => f.column === col)?.value ?? ''}
                      onChange={(e) => onFilterChange(col, e.target.value)}
                      placeholder={'...'}
                      className={
                        'font-jetbrains w-full min-w-16 rounded border border-black/10 bg-white px-2 py-1 text-xs font-normal text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-blue-400 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-blue-500'
                      }
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {data.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={
                  'border-b border-black/5 transition-colors hover:bg-zinc-50/50 dark:border-white/5 dark:hover:bg-zinc-800/50'
                }
              >
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className={'max-w-xs truncate px-3 py-1.5 whitespace-nowrap'}>
                    <CellValue value={cell} raw={rawMode} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className={'flex items-center justify-between border-t border-black/10 px-4 py-2 dark:border-white/10'}>
          <span className={'font-jetbrains text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500'}>
            {((data.page - 1) * data.pageSize + 1).toLocaleString()}&ndash;
            {Math.min(data.page * data.pageSize, data.totalRows).toLocaleString()} / {data.totalRows.toLocaleString()}
          </span>
          <div className={'flex items-center gap-0.5'}>
            <Button
              variant={'ghost'}
              size={'icon-sm'}
              aria-label={'Previous page'}
              disabled={data.page <= 1}
              onClick={() => onPageChange(data.page - 1)}
              icon={ChevronLeft}
              iconClass={'size-3.5'}
            />
            <span className={'font-jetbrains min-w-12 text-center text-[11px] text-zinc-500 tabular-nums'}>
              {data.page} / {totalPages}
            </span>
            <Button
              variant={'ghost'}
              size={'icon-sm'}
              aria-label={'Next page'}
              disabled={data.page >= totalPages}
              onClick={() => onPageChange(data.page + 1)}
              icon={ChevronRight}
              iconClass={'size-3.5'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type SqlBookmark = {
  name: string;
  sql: string;
};

const BOOKMARKS_KEY = 'shulkr-sqlite-bookmarks';

function loadBookmarks(): Array<SqlBookmark> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? (JSON.parse(raw) as Array<SqlBookmark>) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Array<SqlBookmark>) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

type HistoryEntry = {
  sql: string;
  rowCount: number;
  timestamp: number;
};

function SqlConsole({ exec }: { exec: (sql: string) => Promise<QueryResult> }) {
  const { t } = useTranslation();
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<Array<HistoryEntry>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<Array<SqlBookmark>>(loadBookmarks);
  const [bookmarkName, setBookmarkName] = useState('');
  const [showBookmarkInput, setShowBookmarkInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleExecute = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || executing) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const queryResult = await exec(trimmed);
      setResult(queryResult);
      setHistory((prev) => [{ sql: trimmed, rowCount: queryResult.rowCount, timestamp: Date.now() }, ...prev].slice(0, 50));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExecuting(false);
    }
  }, [sql, executing, exec]);
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute]
  );
  const handleSaveBookmark = useCallback(() => {
    const name = bookmarkName.trim();
    if (!name || !sql.trim()) return;
    const updated = [...bookmarks, { name, sql: sql.trim() }];
    setBookmarks(updated);
    saveBookmarks(updated);
    setBookmarkName('');
    setShowBookmarkInput(false);
  }, [bookmarkName, sql, bookmarks]);
  const handleDeleteBookmark = useCallback(
    (index: number) => {
      const updated = bookmarks.filter((_, i) => i !== index);
      setBookmarks(updated);
      saveBookmarks(updated);
    },
    [bookmarks]
  );
  const handleInsertSql = useCallback((query: string) => {
    setSql(query);
    setShowHistory(false);
    setShowBookmarks(false);
    textareaRef.current?.focus();
  }, []);
  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => textareaRef.current?.focus(), 0);
        }}
        className={
          'group flex shrink-0 items-center gap-2.5 rounded-xl border border-dashed border-black/10 bg-transparent px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-solid hover:border-black/15 hover:bg-white hover:text-zinc-600 dark:border-white/10 dark:hover:border-white/15 dark:hover:bg-zinc-900 dark:hover:text-zinc-300'
        }
      >
        <Terminal className={'size-4'} strokeWidth={2} />
        {t('files.dbViewer.openConsole')}
        <kbd
          className={
            'font-jetbrains rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:group-hover:bg-zinc-700'
          }
        >
          {'⌘↵'}
        </kbd>
      </button>
    );
  }
  return (
    <div className={'shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'}>
      <div className={'flex items-center justify-between border-b border-black/10 px-4 py-2 dark:border-white/10'}>
        <div className={'flex items-center gap-2.5'}>
          <Terminal className={'size-4 text-zinc-400'} strokeWidth={2} />
          <span className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('files.dbViewer.sqlConsole')}</span>
          <span
            className={
              'font-jetbrains rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
            }
          >
            {t('files.dbViewer.readOnly')}
          </span>
        </div>
        <div className={'flex items-center gap-2'}>
          <Button
            variant={'ghost'}
            size={'xs'}
            onClick={() => {
              setShowHistory((v) => !v);
              setShowBookmarks(false);
            }}
            className={cn(showHistory && 'text-blue-500')}
            disabled={history.length === 0}
            icon={History}
            iconClass={'size-3'}
          />
          <Button
            variant={'ghost'}
            size={'xs'}
            onClick={() => {
              setShowBookmarks((v) => !v);
              setShowHistory(false);
            }}
            className={cn(showBookmarks && 'text-blue-500')}
            icon={Bookmark}
            iconClass={'size-3'}
          />
          {sql.trim() && (
            <Button
              variant={'ghost'}
              size={'xs'}
              onClick={() => setShowBookmarkInput((v) => !v)}
              title={t('files.dbViewer.saveBookmark')}
              icon={BookmarkCheck}
              iconClass={'size-3'}
            />
          )}
          <Button
            size={'xs'}
            onClick={handleExecute}
            disabled={!sql.trim() || executing}
            loading={executing}
            icon={Play}
            iconClass={'size-3'}
          >
            {t('files.dbViewer.execute')}
          </Button>
          <Button variant={'ghost'} size={'xs'} onClick={() => setIsOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
      </div>
      {showBookmarkInput && (
        <div className={'flex items-center gap-2 border-b border-black/10 px-4 py-2 dark:border-white/10'}>
          <input
            type={'text'}
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveBookmark();
              if (e.key === 'Escape') setShowBookmarkInput(false);
            }}
            placeholder={t('files.dbViewer.bookmarkName')}
            className={
              'flex-1 rounded border border-black/10 bg-transparent px-2 py-1 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-white/10 dark:text-zinc-300 dark:focus:border-blue-500'
            }
            autoFocus
          />
          <Button size={'xs'} onClick={handleSaveBookmark} disabled={!bookmarkName.trim()}>
            {t('common.save')}
          </Button>
        </div>
      )}
      {showHistory && history.length > 0 && (
        <div className={'max-h-40 overflow-y-auto border-b border-black/10 dark:border-white/10'}>
          {history.map((entry, i) => (
            <button
              key={i}
              onClick={() => handleInsertSql(entry.sql)}
              className={
                'flex w-full items-center justify-between gap-4 px-4 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }
            >
              <span className={'font-jetbrains truncate text-xs text-zinc-600 dark:text-zinc-400'}>{entry.sql}</span>
              <span className={'font-jetbrains shrink-0 text-xs text-zinc-400 tabular-nums'}>{entry.rowCount} rows</span>
            </button>
          ))}
        </div>
      )}
      {showBookmarks && (
        <div className={'max-h-40 overflow-y-auto border-b border-black/10 dark:border-white/10'}>
          {bookmarks.length === 0 ? (
            <p className={'px-4 py-3 text-xs text-zinc-400'}>{t('files.dbViewer.noBookmarks')}</p>
          ) : (
            bookmarks.map((bm, i) => (
              <div
                key={i}
                className={
                  'flex items-center justify-between gap-2 px-4 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }
              >
                <button onClick={() => handleInsertSql(bm.sql)} className={'flex min-w-0 flex-1 flex-col text-left'}>
                  <span className={'text-xs font-medium text-zinc-700 dark:text-zinc-300'}>{bm.name}</span>
                  <span className={'font-jetbrains truncate text-xs text-zinc-400'}>{bm.sql}</span>
                </button>
                <Button
                  variant={'ghost-destructive'}
                  size={'icon-sm'}
                  aria-label={t('common.delete')}
                  onClick={() => handleDeleteBookmark(i)}
                  icon={X}
                  iconClass={'size-3'}
                />
              </div>
            ))
          )}
        </div>
      )}
      <div className={'min-h-10.5 border-b border-black/10 px-4 dark:border-white/10'}>
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={'SELECT * FROM protections LIMIT 10;'}
          className={
            'font-jetbrains w-full resize-y bg-transparent text-sm leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-300 dark:text-zinc-300 dark:placeholder:text-zinc-600'
          }
          rows={3}
          spellCheck={false}
          autoFocus
        />
      </div>
      {error && (
        <div className={'border-b border-black/10 px-4 py-3 dark:border-white/10'}>
          <p className={'font-jetbrains text-sm text-red-500'}>{error}</p>
        </div>
      )}
      {result && (
        <div className={'flex flex-col'}>
          <div className={'flex items-center justify-between px-4 py-2 text-xs text-zinc-400 dark:text-zinc-500'}>
            <span className={'font-jetbrains tabular-nums'}>
              {result.rowCount.toLocaleString()} {result.rowCount === 1 ? 'row' : 'rows'} &middot; {result.time.toFixed(1)}ms
            </span>
            {result.columns.length > 0 && result.rows.length > 0 && (
              <ExportButton columns={result.columns} rows={result.rows} filename={'query_result'} />
            )}
          </div>
          {result.columns.length > 0 && result.rows.length > 0 && (
            <div className={'max-h-80 overflow-auto'}>
              <table className={'w-full text-sm'}>
                <thead className={'sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800'}>
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className={
                          'border-b border-black/10 px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-zinc-500 dark:border-white/10 dark:text-zinc-400'
                        }
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className={
                        'border-b border-black/5 transition-colors hover:bg-zinc-50/50 dark:border-white/5 dark:hover:bg-zinc-800/50'
                      }
                    >
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className={'max-w-xs truncate px-3 py-1.5 whitespace-nowrap'}>
                          <CellValue value={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function escapeCsvValue(value: unknown): string {
  if (value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(columns: Array<string>, rows: Array<Array<unknown>>): string {
  const header = columns.map(escapeCsvValue).join(',');
  const lines = rows.map((row) => row.map(escapeCsvValue).join(','));
  return [header, ...lines].join('\n');
}

function toJson(columns: Array<string>, rows: Array<Array<unknown>>): string {
  const objects = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportButton({
  columns,
  rows,
  filename,
  fetchAll,
}: {
  columns: Array<string>;
  rows: Array<Array<unknown>>;
  filename: string;
  fetchAll?: () => Promise<{ columns: Array<string>; rows: Array<Array<unknown>> } | null>;
}) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      setExporting(true);
      try {
        let exportColumns = columns;
        let exportRows = rows;
        if (fetchAll) {
          const allData = await fetchAll();
          if (allData) {
            exportColumns = allData.columns;
            exportRows = allData.rows;
          }
        }
        const ext = format;
        const content = format === 'csv' ? toCsv(exportColumns, exportRows) : toJson(exportColumns, exportRows);
        const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
        downloadBlob(content, `${filename}.${ext}`, mimeType);
      } finally {
        setExporting(false);
      }
    },
    [columns, rows, filename, fetchAll]
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={'ghost'} size={'xs'} disabled={exporting} loading={exporting} icon={FileDown} iconClass={'size-3'}>
          {t('files.dbViewer.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={'end'}>
        <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_SECONDS_MIN = 946684800; // 2000-01-01
const TIMESTAMP_SECONDS_MAX = 4102444800; // 2100-01-01
const TIMESTAMP_MS_MIN = TIMESTAMP_SECONDS_MIN * 1000;
const TIMESTAMP_MS_MAX = TIMESTAMP_SECONDS_MAX * 1000;

function formatTimestamp(value: number): string {
  if (value >= TIMESTAMP_MS_MIN && value <= TIMESTAMP_MS_MAX) {
    return new Date(value).toLocaleString();
  }
  if (value >= TIMESTAMP_SECONDS_MIN && value <= TIMESTAMP_SECONDS_MAX) {
    return new Date(value * 1000).toLocaleString();
  }
  return String(value);
}

function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'number') return false;
  return (
    (value >= TIMESTAMP_SECONDS_MIN && value <= TIMESTAMP_SECONDS_MAX) || (value >= TIMESTAMP_MS_MIN && value <= TIMESTAMP_MS_MAX)
  );
}

function CellValue({ value, raw }: { value: unknown; raw?: boolean }) {
  if (value === null) {
    return <span className={'font-jetbrains text-xs text-zinc-300 italic dark:text-zinc-600'}>NULL</span>;
  }
  if (value instanceof Uint8Array || (typeof value === 'object' && 'byteLength' in value)) {
    const size = (value as { byteLength: number }).byteLength;
    return <span className={'font-jetbrains text-xs text-zinc-400'}>BLOB ({formatFileSize(size)})</span>;
  }
  if (!raw) {
    if (typeof value === 'number' && isTimestamp(value)) {
      return (
        <span className={'font-jetbrains text-xs text-zinc-700 dark:text-zinc-300'} title={String(value)}>
          {formatTimestamp(value)}
        </span>
      );
    }
    if (typeof value === 'string' && UUID_REGEX.test(value)) {
      return (
        <span className={'font-jetbrains text-xs text-zinc-700 dark:text-zinc-300'} title={value}>
          {value.substring(0, 8)}&hellip;
        </span>
      );
    }
  }
  return <span className={'font-jetbrains text-xs text-zinc-700 dark:text-zinc-300'}>{String(value)}</span>;
}
