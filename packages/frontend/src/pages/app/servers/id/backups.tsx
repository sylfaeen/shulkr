import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Archive, Download, HardDrive, Loader2, LoaderCircle, Pencil, Plus, Settings, Trash2, Check, X } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer, useBackupServer, useUpdateServer } from '@shulkr/frontend/hooks/use_servers';
import { useBackups, useRenameBackup, useDeleteBackup } from '@shulkr/frontend/hooks/use_backups';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
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
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';

export function ServerBackupsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.backups')}` : t('nav.backups'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

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

  const can = useHasPermission();
  const canList = can('server:backups:list');
  const canCreate = can('server:backups:create');
  const canDownload = can('server:backups:download');
  const canDelete = can('server:backups:delete');

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data: server } = useServer(serverId);
  const { data: backups, isLoading: backupsLoading } = useBackups(serverId);
  const backupServer = useBackupServer();
  const renameBackup = useRenameBackup(serverId);
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
    setDialogOpen(false);
    try {
      await backupServer.mutateAsync(serverId, paths);
      queryClient.invalidateQueries({ queryKey: ['servers', 'listBackups', serverId] }).then();
    } catch {}
  };

  const handleDownload = async (filename: string) => {
    if (!canDownload) return null;
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
    if (!canDelete) return;
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
    if (!canDelete) return;
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
            <div className={'flex items-center justify-end gap-2'}>
              {canList && (
                <Button onClick={() => setSettingsOpen(true)} variant={'secondary'}>
                  <Settings className={'size-4'} />
                  {t('backups.settings.button')}
                </Button>
              )}
              {canCreate && (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className={'size-4'} />
                  {t('backups.backupNow')}
                </Button>
              )}
            </div>
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {backupsLoading ? (
            <div className={'py-8 text-center'}>
              <LoaderCircle className={'mx-auto size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
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
                      {canDelete && (
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
                      )}
                    </div>
                  )}
                </FeatureCard.Row>
              )}
              {backups.map((backup, index) => (
                <BackupRow
                  key={backup.filename}
                  selected={selected.has(backup.filename)}
                  onToggleSelect={() => toggleSelect(backup.filename)}
                  renamePending={renameBackup.isPending}
                  onDownload={handleDownload}
                  onRename={(filename, newFilename) => renameBackup.mutateAsync({ filename, newFilename })}
                  onRequestDelete={setDeleteConfirm}
                  {...{ backup, index }}
                />
              ))}
              <PasswordGate
                open={deleteConfirm !== null}
                onOpenChange={(open) => !open && setDeleteConfirm(null)}
                title={t('common.delete')}
                description={deleteConfirm ?? ''}
                confirmLabel={t('common.delete')}
                destructive
                onConfirm={async () => {
                  if (deleteConfirm) await handleDelete(deleteConfirm);
                }}
              />
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

function getBackupType(filename: string): 'full' | 'incremental' {
  return filename.includes('-incremental-') ? 'incremental' : 'full';
}

function BackupRow({
  backup,
  index,
  selected,
  renamePending,
  onToggleSelect,
  onDownload,
  onRename,
  onRequestDelete,
}: {
  backup: { filename: string; size: number; created: string; status?: 'creating' | 'ready'; progress?: number };
  index: number;
  selected: boolean;
  renamePending: boolean;
  onToggleSelect: () => void;
  onDownload: (filename: string) => void;
  onRename: (filename: string, newFilename: string) => void;
  onRequestDelete: (filename: string) => void;
}) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canDownload = can('server:backups:download');
  const canRename = can('server:backups:rename');
  const canDelete = can('server:backups:delete');

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const source = getBackupSource(backup.filename);
  const backupType = getBackupType(backup.filename);
  const isCreating = backup.status === 'creating';
  const isNewest = index === 0 && !isCreating;

  // Extract server slug prefix (e.g. "my-server-") so user can only edit the rest
  const slugMatch = backup.filename.match(/^([a-z0-9-]+?-(?:manual|auto)(?:-incremental)?-)/);
  const slugPrefix = slugMatch ? slugMatch[1] : '';
  const editablePart = backup.filename.slice(slugPrefix.length).replace(/\.zip$/, '');

  const startRename = () => {
    if (!canRename) return;
    setEditValue(editablePart);
    setEditing(true);
  };

  const confirmRename = () => {
    if (!canRename) return;
    const newFilename = slugPrefix + editValue.trim() + '.zip';
    if (newFilename !== backup.filename && editValue.trim()) {
      onRename(backup.filename, newFilename);
    }
    setEditing(false);
  };

  const cancelRename = () => setEditing(false);

  return (
    <FeatureCard.Row interactive className={cn('min-h-18.25 items-center py-3', isCreating && 'opacity-70')}>
      <div className={'flex min-w-0 flex-1 items-center gap-3'}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          disabled={isCreating}
        />
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-white transition-opacity',
            isCreating ? 'bg-orange-500' : 'bg-blue-600'
          )}
        >
          {isCreating ? (
            <Loader2 className={'size-4 animate-spin'} strokeWidth={2} />
          ) : (
            <Archive className={'size-4'} strokeWidth={2} />
          )}
        </div>
        <div className={'min-w-0'}>
          {editing ? (
            <div className={'flex items-center gap-0'}>
              {slugPrefix && <span className={'font-jetbrains text-sm text-zinc-400 dark:text-zinc-500'}>{slugPrefix}</span>}
              <Input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                style={{ width: `${Math.max(editValue.length, 1)}ch` }}
                className={
                  'font-jetbrains h-7 w-auto min-w-16 rounded-none border-x-0 border-t-0 border-b px-0 text-sm shadow-none focus-visible:ring-0'
                }
              />
              <span className={'font-jetbrains text-sm text-zinc-400 dark:text-zinc-500'}>.zip</span>
              <Button onClick={confirmRename} variant={'ghost'} size={'icon-xs'} className={'ml-1.5'} disabled={renamePending}>
                <Check className={'size-3.5'} />
              </Button>
              <Button onClick={cancelRename} variant={'ghost'} size={'icon-xs'}>
                <X className={'size-3.5'} />
              </Button>
            </div>
          ) : (
            <span className={'font-jetbrains truncate text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
              {backup.filename}
            </span>
          )}
          <div className={'mt-0.5 flex w-full items-center gap-2'}>
            {isCreating && (
              <div className={'flex w-full items-center gap-2'}>
                <div className={'h-1.5 w-full overflow-hidden rounded-full bg-orange-200 dark:bg-orange-900/30'}>
                  <div
                    className={'h-full rounded-full bg-orange-500 transition-all duration-700 ease-out'}
                    style={{ width: `${backup.progress ?? 0}%` }}
                  />
                </div>
                <span className={'font-jetbrains text-xs text-orange-600 tabular-nums dark:text-orange-400'}>
                  {backup.progress ?? 0}%
                </span>
              </div>
            )}
            {isNewest && <Badge className={'font-medium'}>{t('backups.latest')}</Badge>}
            {!isCreating && source && (
              <Badge variant={'secondary'} className={'font-medium'}>
                {t(`backups.source${source === 'auto' ? 'Auto' : 'Manual'}`)}
              </Badge>
            )}
            {!isCreating && (
              <Badge variant={backupType === 'incremental' ? 'outline' : 'secondary'} className={'font-medium'}>
                {t(`backups.type${backupType === 'incremental' ? 'Incremental' : 'Full'}`)}
              </Badge>
            )}
            {!isCreating && (
              <>
                {(isNewest || source) && <span className={'text-sm text-zinc-300 dark:text-zinc-700'}>·</span>}
                <span className={'font-jetbrains text-sm text-zinc-600 tabular-nums dark:text-zinc-400'}>
                  {formatFileSize(backup.size)}
                </span>
                <span className={'text-sm text-zinc-300 dark:text-zinc-700'}>·</span>
                <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{formatRelativeDate(backup.created)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={'flex shrink-0 items-center gap-1.5'}>
        {isCreating ? null : (
          <TooltipProvider delayDuration={300}>
            {canDownload && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onDownload(backup.filename)} variant={'ghost'} size={'icon-sm'}>
                    <Download className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('backups.tooltipDownload')}</TooltipContent>
              </Tooltip>
            )}
            {canRename && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={startRename} variant={'ghost'} size={'icon-sm'}>
                    <Pencil className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('backups.tooltipRename')}</TooltipContent>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onRequestDelete(backup.filename)} variant={'ghost-destructive'} size={'icon-sm'}>
                    <Trash2 className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('backups.tooltipDelete')}</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
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
