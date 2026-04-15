import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowDown, FileText, Loader2, Merge, Radio, Search, ScrollText, Trash2 } from 'lucide-react';
import { formatDateTime } from '@shulkr/frontend/lib/date';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { LogLine } from '@shulkr/frontend/features/ui/log_line';
import { ConsoleLogLine } from '@shulkr/frontend/features/ui/console_log_line';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useConsoleWebSocket } from '@shulkr/frontend/hooks/use_console';
import {
  useLogFiles,
  useLogContent,
  useDeleteLog,
  useMergeLogs,
  useMergePreview,
  formatLogSize,
} from '@shulkr/frontend/hooks/use_logs';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { MergeWarningDialog } from '@shulkr/frontend/pages/app/servers/dialogs/merge_warning_dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Tabs, TabsList, TabsTrigger } from '@shulkr/frontend/features/ui/shadcn/tabs';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';

type Tab = 'live' | 'archives';

export function ServerLogsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.logs')}` : t('nav.logs'));

  const [tab, setTab] = useState<Tab>('live');
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null);

  const needsFill = tab === 'live' || (tab === 'archives' && selectedArchive !== null);

  if (serverLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('errors.generic')} />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={ScrollText} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.logs')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('logs.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent fill={needsFill}>
        <LogsContent serverId={server.id} {...{ tab, setTab, selectedArchive, setSelectedArchive, needsFill }} />
      </PageContent>
    </>
  );
}

function LogsContent({
  serverId,
  tab,
  setTab,
  selectedArchive,
  setSelectedArchive,
  needsFill,
}: {
  serverId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  selectedArchive: string | null;
  setSelectedArchive: (archive: string | null) => void;
  needsFill: boolean;
}) {
  const { t } = useTranslation();
  const { messages, isConnected, isConnecting, playerDetails, hasMore, isLoadingMore, loadMore } =
    useConsoleWebSocket(serverId);
  const playerNames = useMemo(() => new Set(playerDetails.map((p) => p.name)), [playerDetails]);

  return (
    <div className={cn(needsFill ? 'flex min-h-0 flex-1 flex-col gap-4' : 'space-y-4')}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
          if (value === 'live') setSelectedArchive(null);
        }}
        className={'shrink-0 gap-0'}
      >
        <TabsList variant={'line'}>
          <TabsTrigger value={'live'}>
            <Radio className={'size-3.5'} />
            {t('logs.live')}
          </TabsTrigger>
          <TabsTrigger value={'archives'}>
            <Archive className={'size-3.5'} />
            {t('logs.archives')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'live' && (
        <div className={'min-h-0 flex-1'}>
          <LiveLogs {...{ serverId, messages, isConnected, isConnecting, playerNames, hasMore, isLoadingMore, loadMore }} />
        </div>
      )}
      {tab === 'archives' && !selectedArchive && (
        <ArchiveList onSelect={(filename) => setSelectedArchive(filename)} {...{ serverId }} />
      )}
      {tab === 'archives' && selectedArchive && (
        <div className={'min-h-0 flex-1'}>
          <ArchiveViewer filename={selectedArchive} onBack={() => setSelectedArchive(null)} {...{ serverId, playerNames }} />
        </div>
      )}
    </div>
  );
}

function LiveLogs({
  serverId,
  messages,
  isConnected,
  isConnecting,
  playerNames,
}: {
  serverId: string;
  messages: Array<{ id: string; data: string; timestamp: number; level?: string }>;
  isConnected: boolean;
  isConnecting: boolean;
  playerNames: Set<string>;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: (() => void) | undefined;
}) {
  const { t, i18n } = useTranslation();

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const filteredMessages = messages.filter((msg) => {
    if (search && !msg.data.toLowerCase().includes(search.toLowerCase())) return false;
    if (levelFilter && msg.level !== levelFilter) return false;
    return true;
  });

  return (
    <div className={'relative flex h-full flex-col'}>
      <div className={'dark flex max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950'}>
        <div className={'flex shrink-0 flex-wrap items-center justify-between gap-2 bg-zinc-900 px-4 py-2.5'}>
          <div className={'flex items-center gap-2'}>
            <div className={'relative'}>
              <Search className={'absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-500'} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('logs.search')}
                className={'h-8 border-zinc-700 bg-zinc-950 pl-8 text-sm text-zinc-200 placeholder-zinc-500'}
              />
            </div>
            <LevelFilterButtons active={levelFilter} onChange={setLevelFilter} />
          </div>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1',
              isConnected ? 'bg-green-400/10' : isConnecting ? 'bg-amber-400/10' : 'bg-red-400/10'
            )}
          >
            <div
              className={cn(
                'size-1.5 rounded-full',
                isConnected
                  ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                  : isConnecting
                    ? 'animate-pulse bg-amber-500'
                    : 'bg-red-500'
              )}
            />
            <span
              className={cn(
                'text-[10px] font-semibold uppercase',
                isConnected ? 'text-green-400' : isConnecting ? 'text-amber-400' : 'text-red-400'
              )}
            >
              {isConnected ? t('console.connected') : isConnecting ? t('console.connecting') : t('console.disconnected')}
            </span>
          </div>
        </div>
        <div className={'h-px bg-zinc-700/50'} />
        <div ref={containerRef} onScroll={handleScroll} className={'min-h-0 flex-1 overflow-y-auto px-3 py-2'}>
          {filteredMessages.length === 0 ? (
            <div className={'flex flex-col items-center justify-center gap-3 py-12'}>
              <div className={'flex size-10 items-center justify-center rounded-xl bg-zinc-800'}>
                <ScrollText className={'size-5 text-zinc-500'} />
              </div>
              <p className={'font-jetbrains text-sm text-zinc-500'}>
                {isConnected ? t('logs.noLogsYet') : t('console.startToViewLogs')}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const datePart = new Date(msg.timestamp)
                .toLocaleDateString(i18n.language, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
                .replaceAll('/', '-');

              return <ConsoleLogLine key={msg.id} date={datePart} level={msg.level} message={msg.data} {...{ playerNames, serverId }} />;
            })
          )}
        </div>
      </div>
      {!autoScroll && filteredMessages.length > 0 && (
        <Button
          size={'sm'}
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className={'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-lg backdrop-blur-sm'}
        >
          <ArrowDown className={'size-3'} />
          Auto-scroll
        </Button>
      )}
    </div>
  );
}

function ArchiveList({ serverId, onSelect }: { serverId: string; onSelect: (filename: string) => void }) {
  const { t } = useTranslation();
  const { data: files, isLoading } = useLogFiles(serverId);
  const deleteLog = useDeleteLog(serverId);
  const mergeLogs = useMergeLogs(serverId);
  const mergePreview = useMergePreview(serverId);

  const can = useHasPermission();
  const canLogs = can('server:files:read:logs');

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkMergeConfirm, setBulkMergeConfirm] = useState(false);
  const [mergeWarning, setMergeWarning] = useState<{ totalLines: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;

  const archives = files?.filter((f) => !f.isLatest) ?? [];
  const hasSelection = selected.size > 0;
  const allSelected = archives.length > 0 && selected.size === archives.length;

  const toggleSelect = (filename: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(archives.map((f) => f.filename)));
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await deleteLog.mutateAsync({ filename });
      setDeleteConfirm(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    } catch {}
  };

  const handleBulkDelete = async () => {
    for (const filename of selected) {
      try {
        await deleteLog.mutateAsync({ filename });
      } catch {}
    }
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  };

  const handleMergeRequest = async () => {
    setBulkMergeConfirm(false);
    try {
      const preview = await mergePreview.mutateAsync({ filenames: [...selected] });
      if (preview.totalLines > 30_000) {
        setMergeWarning({ totalLines: preview.totalLines });
      } else {
        await mergeLogs.mutateAsync({ filenames: [...selected] });
        setSelected(new Set());
      }
    } catch {}
  };

  const handleMergeWithSplit = async () => {
    try {
      await mergeLogs.mutateAsync({ filenames: [...selected] });
      setSelected(new Set());
    } catch {}
    setMergeWarning(null);
  };

  const handleMergeForce = async () => {
    try {
      await mergeLogs.mutateAsync({ filenames: [...selected], force: true });
      setSelected(new Set());
    } catch {}
    setMergeWarning(null);
  };

  return (
    <>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={archives.length}>{t('logs.archiveTitle')}</FeatureCard.Title>
              <FeatureCard.Description>{t('logs.archiveDescription')}</FeatureCard.Description>
            </FeatureCard.Content>
          </FeatureCard.Header>
          <FeatureCard.Body>
            {archives.length === 0 ? (
              <FeatureCard.Empty icon={ScrollText} title={t('logs.noArchives')} description={t('logs.noArchivesDescription')} />
            ) : (
              <>
                <FeatureCard.Row className={'min-h-10.5 bg-white py-2 dark:bg-zinc-800/50'}>
                  <Label className={'flex items-center gap-3'}>
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    <span className={'text-sm font-medium text-zinc-500 dark:text-zinc-400'}>{t('logs.selectAll')}</span>
                  </Label>
                  {hasSelection && (
                    <div className={'flex items-center justify-between gap-4'}>
                      <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>
                        {t('logs.selected', { count: selected.size })}
                      </span>
                      {canLogs && (
                        <div className={'flex items-center gap-2'}>
                          {bulkMergeConfirm ? (
                            <div className={'flex items-center gap-1.5'}>
                              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>
                                {t('logs.mergeConfirm', { count: selected.size })}
                              </span>
                              <Button
                                onClick={handleMergeRequest}
                                variant={'default'}
                                size={'xs'}
                                disabled={mergeLogs.isPending || mergePreview.isPending}
                                loading={mergeLogs.isPending || mergePreview.isPending}
                              >
                                {t('common.yes')}
                              </Button>
                              <Button onClick={() => setBulkMergeConfirm(false)} variant={'ghost'} size={'xs'}>
                                {t('common.no')}
                              </Button>
                            </div>
                          ) : bulkDeleteConfirm ? (
                            <div className={'flex items-center gap-1.5'}>
                              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
                              <Button
                                onClick={handleBulkDelete}
                                variant={'destructive'}
                                size={'xs'}
                                disabled={deleteLog.isPending}
                                loading={deleteLog.isPending}
                              >
                                {t('common.yes')}
                              </Button>
                              <Button onClick={() => setBulkDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
                                {t('common.no')}
                              </Button>
                            </div>
                          ) : (
                            <>
                              {selected.size >= 2 && (
                                <Button onClick={() => setBulkMergeConfirm(true)} variant={'ghost'} size={'xs'}>
                                  <Merge className={'size-3.5'} />
                                  {t('logs.merge')}
                                </Button>
                              )}
                              <Button onClick={() => setBulkDeleteConfirm(true)} variant={'ghost-destructive'} size={'xs'}>
                                <Trash2 className={'size-3.5'} />
                                {t('common.delete')}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </FeatureCard.Row>
                {archives.map((file) => (
                  <FeatureCard.Row
                    key={file.filename}
                    interactive
                    className={'cursor-pointer'}
                    onClick={() => onSelect(file.filename)}
                  >
                    <div className={'flex min-w-0 items-center gap-3'}>
                      <Checkbox
                        checked={selected.has(file.filename)}
                        onCheckedChange={() => toggleSelect(file.filename)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <FileText className={'size-4 shrink-0 text-zinc-400'} />
                      <div className={'min-w-0'}>
                        <p className={'truncate text-sm font-medium'}>{file.filename}</p>
                        <p className={'text-xs text-zinc-500'}>{formatDateTime(file.modified)}</p>
                      </div>
                    </div>
                    <div className={'flex shrink-0 items-center gap-2'} onClick={(e) => e.stopPropagation()}>
                      <Badge variant={'secondary'}>{formatLogSize(file.size)}</Badge>
                      {canLogs && (
                        <>
                          {deleteConfirm === file.filename ? (
                            <div className={'flex items-center gap-1.5'}>
                              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
                              <Button
                                onClick={() => handleDelete(file.filename)}
                                variant={'destructive'}
                                size={'xs'}
                                disabled={deleteLog.isPending}
                                loading={deleteLog.isPending}
                              >
                                {t('common.yes')}
                              </Button>
                              <Button onClick={() => setDeleteConfirm(null)} variant={'ghost'} size={'xs'}>
                                {t('common.no')}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={() => setDeleteConfirm(file.filename)}
                              variant={'ghost-destructive'}
                              size={'icon-sm'}
                            >
                              <Trash2 className={'size-4'} />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </FeatureCard.Row>
                ))}
              </>
            )}
          </FeatureCard.Body>
        </FeatureCard>
      </FeatureCard.Stack>
      {mergeWarning && (
        <MergeWarningDialog
          totalLines={mergeWarning.totalLines}
          onSplit={handleMergeWithSplit}
          onForce={handleMergeForce}
          onCancel={() => setMergeWarning(null)}
          {...{ isPending: mergeLogs.isPending }}
        />
      )}
    </>
  );
}

function extractDateFromFilename(filename: string, locale: string): string | undefined {
  const mcMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mcMatch) {
    return new Date(`${mcMatch[1]}-${mcMatch[2]}-${mcMatch[3]}`)
      .toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      .replaceAll('/', '-');
  }

  const mergedMatch = filename.match(/^merged-(\d+)/);
  if (mergedMatch) {
    return new Date(Number(mergedMatch[1]))
      .toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      .replaceAll('/', '-');
  }

  return undefined;
}

function ArchiveViewer({ serverId, filename, onBack, playerNames }: { serverId: string; filename: string; onBack: () => void; playerNames: Set<string> }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useLogContent(serverId, filename);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  const archiveDate = extractDateFromFilename(filename, i18n.language);

  const filteredLines = (data?.lines ?? []).filter((line) => {
    if (search && !line.message.toLowerCase().includes(search.toLowerCase())) return false;
    if (levelFilter && line.level !== levelFilter) return false;
    return true;
  });

  return (
    <div className={'flex h-full flex-col'}>
      <div
        className={
          'flex max-w-full flex-1 flex-col overflow-hidden rounded-xl bg-zinc-100/80 p-1 shadow-inner dark:bg-zinc-800/80'
        }
      >
        <div className={'shadow-inner-xs flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg'}>
          <div className={'flex shrink-0 flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900'}>
            <div className={'flex items-center gap-2'}>
              <Button
                size={'sm'}
                variant={'ghost'}
                onClick={onBack}
                className={'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}
              >
                {t('logs.backToArchives')}
              </Button>
              <span
                className={
                  'font-jetbrains rounded-md bg-zinc-200/60 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-400'
                }
              >
                {filename}
              </span>
              {data && <Badge variant={'secondary'}>{t('logs.lineCount', { count: data.totalLines })}</Badge>}
            </div>
            <div className={'flex items-center gap-2'}>
              <div className={'relative'}>
                <Search className={'absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500'} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('logs.search')}
                  className={
                    'h-8 border-zinc-200 bg-white pl-8 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder-zinc-500'
                  }
                />
              </div>
              <LevelFilterButtons active={levelFilter} onChange={setLevelFilter} />
            </div>
          </div>
          <div className={'h-px bg-zinc-200/80 dark:bg-zinc-700/50'} />
          <div className={'min-h-0 flex-1 overflow-y-auto bg-white p-2 dark:bg-zinc-950'}>
            {isLoading ? (
              <div className={'flex items-center justify-center gap-2 py-12'}>
                <Loader2 className={'size-4 animate-spin text-zinc-400'} />
                <span className={'font-jetbrains text-sm text-zinc-400 dark:text-zinc-500'}>{t('logs.loading')}</span>
              </div>
            ) : (
              filteredLines.map((line, i) => (
                <LogLine key={i} lineNumber={i + 1} date={archiveDate} level={line.level} message={line.message} {...{ playerNames, serverId }} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelFilterButtons({ active, onChange }: { active: string | null; onChange: (level: string | null) => void }) {
  const LEVELS = ['INFO', 'WARN', 'ERROR'] as const;

  return (
    <div className={'flex items-center gap-1'}>
      {LEVELS.map((level) => (
        <button
          key={level}
          type={'button'}
          onClick={() => onChange(active === level ? null : level)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
            active === level
              ? level === 'ERROR'
                ? 'bg-red-500/15 text-red-700 dark:bg-red-400/15 dark:text-red-400'
                : level === 'WARN'
                  ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400'
                  : 'bg-blue-500/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-400'
              : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
          )}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
