import { useState, useRef, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowDown, FileText, Radio, Search, ScrollText, Filter, Trash2 } from 'lucide-react';
import { formatDateTime } from '@shulkr/frontend/lib/date';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { LogLine } from '@shulkr/frontend/features/ui/log_line';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useConsoleWebSocket } from '@shulkr/frontend/hooks/use_console';
import { useLogFiles, useLogContent, useDeleteLog, formatLogSize } from '@shulkr/frontend/hooks/use_logs';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Tabs, TabsList, TabsTrigger } from '@shulkr/frontend/features/ui/shadcn/tabs';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

type Tab = 'live' | 'archives';

export function ServerLogsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.logs')}` : t('nav.logs'));

  const [tab, setTab] = useState<Tab>('live');
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null);

  const needsFill = tab === 'live' || (tab === 'archives' && selectedArchive !== null);

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

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

type LogsContentProps = {
  serverId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  selectedArchive: string | null;
  setSelectedArchive: (archive: string | null) => void;
  needsFill: boolean;
};

function LogsContent({ serverId, tab, setTab, selectedArchive, setSelectedArchive, needsFill }: LogsContentProps) {
  const { t } = useTranslation();

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
          <LiveLogs {...{ serverId }} />
        </div>
      )}
      {tab === 'archives' && !selectedArchive && (
        <ArchiveList onSelect={(filename) => setSelectedArchive(filename)} {...{ serverId }} />
      )}
      {tab === 'archives' && selectedArchive && (
        <div className={'min-h-0 flex-1'}>
          <ArchiveViewer filename={selectedArchive} onBack={() => setSelectedArchive(null)} {...{ serverId }} />
        </div>
      )}
    </div>
  );
}

function LiveLogs({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { messages, isConnected, isConnecting } = useConsoleWebSocket(serverId);

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
      <div className={'flex max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-zinc-950'}>
        <div
          className={'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2'}
        >
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
          <div className={'flex items-center gap-2'}>
            <div
              className={cn(
                'size-2 rounded-full',
                isConnected ? 'bg-green-600' : isConnecting ? 'animate-pulse bg-amber-500' : 'bg-red-600'
              )}
            />
            <span className={'text-[10px] font-medium text-zinc-500 uppercase'}>
              {isConnected ? t('console.connected') : isConnecting ? t('console.connecting') : t('console.disconnected')}
            </span>
          </div>
        </div>
        <div ref={containerRef} onScroll={handleScroll} className={'custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4'}>
          {filteredMessages.length === 0 ? (
            <div className={'font-jetbrains py-8 text-center text-sm text-zinc-600'}>
              {isConnected ? t('logs.noLogsYet') : t('console.startToViewLogs')}
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <LogLine
                key={msg.id}
                time={
                  msg.logTime ||
                  new Date(msg.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })
                }
                level={msg.level}
                message={msg.data}
              />
            ))
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
          className={
            'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-green-600/90 shadow-lg backdrop-blur-sm hover:bg-green-600'
          }
        >
          <ArrowDown className={'size-3'} />
          Auto-scroll
        </Button>
      )}
    </div>
  );
}

type ArchiveListProps = {
  serverId: string;
  onSelect: (filename: string) => void;
};

function ArchiveList({ serverId, onSelect }: ArchiveListProps) {
  const { t } = useTranslation();
  const { data: files, isLoading } = useLogFiles(serverId);
  const deleteLog = useDeleteLog(serverId);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
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

  return (
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
                    <div className={'flex items-center gap-2'}>
                      {bulkDeleteConfirm ? (
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
                        <Button onClick={() => setBulkDeleteConfirm(true)} variant={'ghost-destructive'} size={'xs'}>
                          <Trash2 className={'size-3.5'} />
                          {t('common.delete')}
                        </Button>
                      )}
                    </div>
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
                      <Button onClick={() => setDeleteConfirm(file.filename)} variant={'ghost-destructive'} size={'icon-sm'}>
                        <Trash2 className={'size-4'} />
                      </Button>
                    )}
                  </div>
                </FeatureCard.Row>
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
    </FeatureCard.Stack>
  );
}

type ArchiveViewerProps = {
  serverId: string;
  filename: string;
  onBack: () => void;
};

function ArchiveViewer({ serverId, filename, onBack }: ArchiveViewerProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useLogContent(serverId, filename);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  const filteredLines = (data?.lines ?? []).filter((line) => {
    if (search && !line.message.toLowerCase().includes(search.toLowerCase())) return false;
    if (levelFilter && line.level !== levelFilter) return false;
    return true;
  });

  return (
    <div className={'flex h-full flex-col'}>
      <div className={'flex max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-zinc-950'}>
        <div
          className={'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-2'}
        >
          <div className={'flex items-center gap-2'}>
            <Button size={'sm'} variant={'ghost'} onClick={onBack} className={'text-zinc-400 hover:text-white'}>
              {t('logs.backToArchives')}
            </Button>
            <span className={'text-sm font-medium text-zinc-300'}>{filename}</span>
            {data && <Badge variant={'secondary'}>{t('logs.lineCount', { count: data.totalLines })}</Badge>}
          </div>
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
        </div>
        <div className={'custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4'}>
          {isLoading ? (
            <div className={'font-jetbrains py-8 text-center text-sm text-zinc-600'}>{t('logs.loading')}</div>
          ) : (
            filteredLines.map((line, i) => <LogLine key={i} time={line.time} level={line.level} message={line.message} />)
          )}
        </div>
      </div>
    </div>
  );
}

const LEVELS = ['INFO', 'WARN', 'ERROR'] as const;

type LevelFilterButtonsProps = {
  active: string | null;
  onChange: (level: string | null) => void;
};

function LevelFilterButtons({ active, onChange }: LevelFilterButtonsProps) {
  return (
    <div className={'flex items-center gap-1'}>
      <Filter className={'size-3.5 text-zinc-500'} />
      {LEVELS.map((level) => (
        <button
          key={level}
          type={'button'}
          onClick={() => onChange(active === level ? null : level)}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
            active === level
              ? level === 'ERROR'
                ? 'bg-red-600 text-white'
                : level === 'WARN'
                  ? 'bg-amber-500 text-white'
                  : 'bg-blue-600 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
