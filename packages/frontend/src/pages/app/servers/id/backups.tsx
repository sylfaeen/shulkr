import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, Download, HardDrive, Plus, Settings, Trash2 } from 'lucide-react';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer, useBackupServer, useUpdateServer } from '@shulkr/frontend/hooks/use_servers';
import { useBackups, useDeleteBackup } from '@shulkr/frontend/hooks/use_backups';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { CreateBackupDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_backup_dialog';
import { BackupSettingsDialog } from '@shulkr/frontend/pages/app/servers/dialogs/backup_settings_dialog';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerBackupsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.backups')}` : t('nav.backups'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <PageLoader />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Archive} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('backups.title')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/tasks'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('backups.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <BackupsSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function BackupsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data: server } = useServer(serverId);
  const { data: backups, isLoading: backupsLoading } = useBackups(serverId);
  const backupServer = useBackupServer();
  const deleteBackup = useDeleteBackup(serverId);
  const updateServer = useUpdateServer();
  const queryClient = useQueryClient();

  const totalSize = backups?.reduce((acc, b) => acc + b.size, 0) ?? 0;
  const hasSelection = selected.size > 0;
  const allSelected = backups !== undefined && backups.length > 0 && selected.size === backups.length;

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
    if (!backups) return;
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(backups.map((b) => b.filename)));
    }
  };

  const handleBackupConfirm = async (paths: Array<string>) => {
    try {
      await backupServer.mutateAsync(serverId, paths);
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['servers', 'listBackups', serverId] }).then();
    } catch {}
  };

  const handleDownload = async (filename: string) => {
    const token = useAuthStore.getState().accessToken;
    const url = `/api/servers/backups/${encodeURIComponent(filename)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const handleDelete = async (filename: string) => {
    try {
      await deleteBackup.mutateAsync({ filename });
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
        await deleteBackup.mutateAsync({ filename });
      } catch {}
    }
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  };

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={backups && backups.length > 0 && backups.length}>{t('backups.title')}</FeatureCard.Title>
            <FeatureCard.Description>{t('backups.subtitle')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions className={'gap-6'}>
            {backups && backups.length > 0 && (
              <div className={'flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
                <HardDrive className={'size-3'} strokeWidth={2} />
                <span>{formatFileSize(totalSize)}</span>
              </div>
            )}
            <Button onClick={() => setSettingsOpen(true)} variant={'secondary'}>
              <Settings className={'size-4'} />
              {t('backups.settings.button')}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className={'size-4'} />
              {t('backups.backupNow')}
            </Button>
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {backupsLoading ? (
            <div className={'py-8 text-center'}>
              <div
                className={'mx-auto size-8 animate-spin rounded-full border-t-2 border-b-2 border-zinc-600 dark:border-zinc-400'}
              />
            </div>
          ) : !backups || backups.length === 0 ? (
            <FeatureCard.Empty icon={Archive} title={t('backups.noBackups')} description={t('backups.createFirst')} />
          ) : (
            <>
              {backups.length > 0 && (
                <FeatureCard.Row className={'min-h-10.5 bg-white py-2 dark:bg-zinc-800/50'}>
                  <Label className={'flex items-center gap-3'}>
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    <span className={'text-sm font-medium text-zinc-500 dark:text-zinc-400'}>{t('backups.selectAll')}</span>
                  </Label>
                  {hasSelection && (
                    <div className={'flex items-center justify-between gap-4'}>
                      <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>
                        {t('backups.selected', { count: selected.size })}
                      </span>
                      <div className={'flex items-center gap-2'}>
                        {bulkDeleteConfirm ? (
                          <div className={'flex items-center gap-1.5'}>
                            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
                            <Button
                              onClick={handleBulkDelete}
                              variant={'destructive'}
                              size={'xs'}
                              disabled={deleteBackup.isPending}
                              loading={deleteBackup.isPending}
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
              )}
              {backups.map((backup, index) => (
                <BackupRow
                  key={backup.filename}
                  selected={selected.has(backup.filename)}
                  onToggleSelect={() => toggleSelect(backup.filename)}
                  deletePending={deleteBackup.isPending}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onDeleteConfirm={setDeleteConfirm}
                  {...{ backup, index, deleteConfirm }}
                />
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <CreateBackupDialog
        open={dialogOpen}
        isPending={backupServer.isPending}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleBackupConfirm}
        {...{ serverId }}
      />
      <BackupSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        currentMaxBackups={server?.max_backups ?? 0}
        isPending={updateServer.isPending}
        onClose={() => setSettingsOpen(false)}
        onSave={async (maxBackups) => {
          await updateServer.mutateAsync({ id: serverId, max_backups: maxBackups });
          queryClient.invalidateQueries({ queryKey: ['servers', 'byId', serverId] }).then();
          setSettingsOpen(false);
        }}
      />
    </>
  );
}

function getBackupSource(filename: string): 'manual' | 'auto' | null {
  if (filename.includes('-manual-')) return 'manual';
  if (filename.includes('-auto-')) return 'auto';
  return null;
}

function BackupRow({
  backup,
  index,
  selected,
  deleteConfirm,
  deletePending,
  onToggleSelect,
  onDownload,
  onDelete,
  onDeleteConfirm,
}: {
  backup: { filename: string; size: number; created: string };
  index: number;
  selected: boolean;
  deleteConfirm: string | null;
  deletePending: boolean;
  onToggleSelect: () => void;
  onDownload: (filename: string) => void;
  onDelete: (filename: string) => void;
  onDeleteConfirm: (filename: string | null) => void;
}) {
  const { t } = useTranslation();
  const isNewest = index === 0;
  const source = getBackupSource(backup.filename);

  return (
    <FeatureCard.Row interactive className={'min-h-18.25 items-center gap-4 py-3'}>
      <Checkbox checked={selected} onCheckedChange={onToggleSelect} onClick={(e) => e.stopPropagation()} />
      <div className={'flex min-w-0 flex-1 items-center gap-3'}>
        <div
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-opacity')}
        >
          <Archive className={'size-4'} strokeWidth={2} />
        </div>
        <div className={'min-w-0'}>
          <span className={'font-jetbrains truncate text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
            {backup.filename}
          </span>
          <div className={'mt-0.5 flex items-center gap-2'}>
            {isNewest && <Badge className={'font-medium'}>{t('backups.latest')}</Badge>}
            {source && (
              <Badge variant={'secondary'} className={'font-medium'}>
                {t(`backups.source${source === 'auto' ? 'Auto' : 'Manual'}`)}
              </Badge>
            )}
            {(isNewest || source) && <span className={'text-sm text-zinc-300 dark:text-zinc-700'}>·</span>}
            <span className={'font-jetbrains text-sm text-zinc-600 tabular-nums dark:text-zinc-400'}>
              {formatFileSize(backup.size)}
            </span>
            <span className={'text-sm text-zinc-300 dark:text-zinc-700'}>·</span>
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{formatRelativeDate(backup.created)}</span>
          </div>
        </div>
      </div>
      <div className={'flex shrink-0 items-center gap-1.5'}>
        {deleteConfirm === backup.filename ? (
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
            <Button
              onClick={() => onDelete(backup.filename)}
              variant={'destructive'}
              size={'xs'}
              disabled={deletePending}
              loading={deletePending}
            >
              {t('common.yes')}
            </Button>
            <Button onClick={() => onDeleteConfirm(null)} variant={'ghost'} size={'xs'}>
              {t('common.no')}
            </Button>
          </div>
        ) : (
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onDownload(backup.filename)}
                    variant={'ghost'}
                    size={'icon-sm'}
                    className={'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-400'}
                  >
                    <Download className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('backups.tooltipDownload')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onDeleteConfirm(backup.filename)} variant={'ghost-destructive'} size={'icon-sm'}>
                    <Trash2 className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('backups.tooltipDelete')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </div>
    </FeatureCard.Row>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
