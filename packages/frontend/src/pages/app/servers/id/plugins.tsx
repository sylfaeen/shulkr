import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  HardDrive,
  Loader2,
  LoaderCircle,
  Package,
  Power,
  PowerOff,
  Puzzle,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDateTime } from '@shulkr/frontend/lib/date';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  usePlugins,
  useUploadPlugin,
  useDeletePlugin,
  useTogglePlugin,
  formatPluginSize,
  type PluginInfo,
} from '@shulkr/frontend/hooks/use_plugins';
import { usePluginUpdates } from '@shulkr/frontend/hooks/use_marketplace';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { MarketplaceDialog } from '@shulkr/frontend/pages/app/servers/dialogs/marketplace_dialog';

export function ServerPluginsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [marketplaceInitialSlug, setMarketplaceInitialSlug] = useState<string | null>(null);

  const openMarketplace = useCallback((slug?: string) => {
    setMarketplaceInitialSlug(slug ?? null);
    setMarketplaceOpen(true);
  }, []);

  usePageTitle(server?.name ? `${server.name} • ${t('nav.plugins')}` : t('nav.plugins'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Puzzle} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.plugins')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/plugins'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('plugins.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
        <ServerPageHeader.Actions />
      </ServerPageHeader>
      <PageContent>
        {server?.status === 'running' && (
          <Alert variant={'warning'} className={'mb-4'}>
            <AlertTriangle className={'size-4'} />
            <AlertDescription>{t('servers.serverRunningWarning')}</AlertDescription>
          </Alert>
        )}
        <FeatureCard.Stack>
          <PluginsSection serverId={server.id} onOpenMarketplace={openMarketplace} />
        </FeatureCard.Stack>
      </PageContent>
      <MarketplaceDialog
        open={marketplaceOpen}
        onOpenChange={(open) => {
          setMarketplaceOpen(open);
          if (!open) setMarketplaceInitialSlug(null);
        }}
        initialSlug={marketplaceInitialSlug}
        serverId={server.id}
      />
    </>
  );
}

function PluginsSection({ serverId, onOpenMarketplace }: { serverId: string; onOpenMarketplace: (slug?: string) => void }) {
  const { t } = useTranslation();

  const [isDragging, setIsDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: pluginsData, isLoading: pluginsLoading } = usePlugins(serverId);
  const { data: updates } = usePluginUpdates(serverId);
  const uploadPlugin = useUploadPlugin(serverId);
  const deletePlugin = useDeletePlugin(serverId);
  const togglePlugin = useTogglePlugin(serverId);

  const plugins = pluginsData?.plugins;
  const enabledCount = plugins?.filter((p) => p.enabled).length ?? 0;
  const totalSize = plugins?.reduce((acc, p) => acc + p.size, 0) ?? 0;
  const hasSelection = selected.size > 0;
  const allSelected = plugins !== undefined && plugins.length > 0 && selected.size === plugins.length;

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
    if (!plugins) return;
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(plugins.map((p) => p.filename)));
    }
  };

  const selectedPlugins = plugins?.filter((p) => selected.has(p.filename)) ?? [];
  const canBulkEnable = selectedPlugins.some((p) => !p.enabled);
  const canBulkDisable = selectedPlugins.some((p) => p.enabled);

  const handleBulkToggle = async (enable: boolean) => {
    const toToggle = selectedPlugins.filter((p) => (enable ? !p.enabled : p.enabled));
    for (const plugin of toToggle) {
      try {
        await togglePlugin.mutateAsync(plugin.filename);
      } catch {}
    }
  };

  const handleBulkDelete = async () => {
    for (const filename of selected) {
      try {
        await deletePlugin.mutateAsync(filename);
      } catch {}
    }
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  };

  const uploadFiles = async (files: Array<File>) => {
    const jarFiles = files.filter((f) => f.name.endsWith('.jar'));
    for (const file of jarFiles) {
      try {
        await uploadPlugin.mutateAsync(file);
      } catch {}
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await uploadFiles(Array.from(e.dataTransfer.files));
  };

  const onFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await uploadFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={'relative'}>
      {isDragging && (
        <div
          className={
            'pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-zinc-400/50 bg-zinc-100/80 dark:bg-zinc-800/80'
          }
        >
          <div className={'flex flex-col items-center gap-2'}>
            <Upload className={'size-6 text-zinc-500'} strokeWidth={2} />
            <span className={'text-sm font-medium text-zinc-600 dark:text-zinc-400'}>{t('plugins.dropHere')}</span>
          </div>
        </div>
      )}
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={plugins && plugins.length > 0 && `${enabledCount}/${plugins.length}`}>
              {t('plugins.installed')}
            </FeatureCard.Title>
            <FeatureCard.Description>{t('plugins.subtitle')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions className={'gap-6'}>
            {plugins && plugins.length > 0 && (
              <div className={'flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
                <HardDrive className={'size-3'} strokeWidth={2} />
                <span>{formatPluginSize(totalSize)}</span>
              </div>
            )}
            <input ref={fileInputRef} type={'file'} accept={'.jar'} multiple onChange={onFileSelect} className={'hidden'} />
            <Button variant={'secondary'} onClick={() => onOpenMarketplace()}>
              <Store className={'size-4'} />
              {t('plugins.marketplace')}
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} loading={uploadPlugin.isPending}>
              <Upload className={'size-4'} />
              {t('plugins.upload')}
            </Button>
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {pluginsLoading ? (
            <div className={'py-8 text-center'}>
              <LoaderCircle className={'mx-auto size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
            </div>
          ) : uploadPlugin.isPending && (!plugins || plugins.length === 0) ? (
            <FeatureCard.Row>
              <div className={'flex w-full items-center justify-center gap-2 py-8'}>
                <Loader2 className={'size-4 animate-spin text-zinc-400'} />
                <span className={'text-sm text-zinc-400'}>{t('files.uploadProgress')}</span>
              </div>
            </FeatureCard.Row>
          ) : !plugins || plugins.length === 0 ? (
            <FeatureCard.Empty icon={Puzzle} title={t('plugins.noPlugins')} description={t('plugins.dropOrUpload')} />
          ) : (
            <>
              {plugins.length > 0 && (
                <FeatureCard.Row className={'min-h-10.5 bg-white py-2 dark:bg-zinc-800/50'}>
                  <Label className={'flex items-center gap-3'}>
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    <span className={'text-sm font-medium text-zinc-500 dark:text-zinc-400'}>{t('plugins.selectAll')}</span>
                  </Label>
                  {hasSelection && (
                    <div className={'flex items-center justify-between gap-4'}>
                      <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>
                        {t('plugins.selected', { count: selected.size })}
                      </span>
                      <div className={'flex items-center gap-2'}>
                        {canBulkEnable && (
                          <Button onClick={() => handleBulkToggle(true)} variant={'success'} size={'xs'}>
                            <Power className={'size-3.5'} />
                            {t('plugins.enable')}
                          </Button>
                        )}
                        {canBulkDisable && (
                          <Button onClick={() => handleBulkToggle(false)} variant={'secondary'} size={'xs'}>
                            <PowerOff className={'size-3.5'} />
                            {t('plugins.tooltipDisable')}
                          </Button>
                        )}
                        {bulkDeleteConfirm ? (
                          <div className={'flex items-center gap-1.5'}>
                            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
                            <Button
                              onClick={handleBulkDelete}
                              variant={'destructive'}
                              size={'xs'}
                              disabled={deletePlugin.isPending}
                              loading={deletePlugin.isPending}
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
              {plugins.map((plugin) => {
                const update = updates?.find((u) => u.filename === plugin.filename);
                return (
                  <PluginRow
                    key={plugin.filename}
                    selected={selected.has(plugin.filename)}
                    onToggleSelect={() => toggleSelect(plugin.filename)}
                    availableVersion={update?.latestVersion.version_number ?? null}
                    onUpdateClick={
                      plugin.marketplaceProjectId ? () => onOpenMarketplace(plugin.marketplaceProjectId!) : undefined
                    }
                    {...{ plugin, togglePlugin, deletePlugin }}
                  />
                );
              })}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
    </div>
  );
}

function PluginRow({
  plugin,
  selected,
  onToggleSelect,
  togglePlugin,
  deletePlugin,
  availableVersion,
  onUpdateClick,
}: {
  plugin: PluginInfo;
  selected: boolean;
  onToggleSelect: () => void;
  togglePlugin: { mutateAsync: (filename: string) => Promise<unknown>; isPending: boolean };
  deletePlugin: { mutateAsync: (filename: string) => Promise<unknown>; isPending: boolean };
  availableVersion: string | null;
  onUpdateClick?: () => void;
}) {
  const { t } = useTranslation();
  const [toggleConfirm, setToggleConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleToggle = async () => {
    try {
      await togglePlugin.mutateAsync(plugin.filename);
      setToggleConfirm(false);
    } catch {}
  };

  const handleDelete = async () => {
    try {
      await deletePlugin.mutateAsync(plugin.filename);
      setDeleteConfirm(false);
    } catch {}
  };

  return (
    <FeatureCard.Row interactive className={'min-h-18.25 w-full items-center gap-4 py-3'}>
      <Checkbox checked={selected} onCheckedChange={onToggleSelect} onClick={(e) => e.stopPropagation()} />
      <div className={cn('flex min-w-0 flex-1 items-center gap-3', !plugin.enabled && 'opacity-50')}>
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity',
            plugin.enabled ? 'bg-green-600 text-white' : 'bg-zinc-300 dark:bg-zinc-100/10 dark:text-zinc-400'
          )}
        >
          <Package className={'size-4'} strokeWidth={2} />
        </div>
        <div className={'min-w-0'}>
          <div className={'flex items-center gap-2'}>
            <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{plugin.name}</span>
            {plugin.version && (
              <span className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>{plugin.version}</span>
            )}
            {!plugin.enabled && (
              <Badge variant={'secondary'} className={'font-medium'}>
                {t('plugins.disabled')}
              </Badge>
            )}
            {availableVersion && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateClick?.();
                }}
                className={cn('cursor-pointer', !onUpdateClick && 'cursor-default')}
              >
                <Badge
                  className={
                    'bg-blue-50 font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40'
                  }
                >
                  {t('plugins.updateAvailable', { version: availableVersion })}
                </Badge>
              </button>
            )}
          </div>
          <div className={'mt-0.5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400'}>
            <span className={'font-jetbrains tabular-nums'}>{formatPluginSize(plugin.size)}</span>
            <span className={'text-zinc-200 dark:text-zinc-700'}>&middot;</span>
            <span>{formatDateTime(plugin.modified)}</span>
          </div>
        </div>
      </div>
      <FeatureCard.RowControl>
        {toggleConfirm ? (
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
            <Button
              onClick={handleToggle}
              variant={plugin.enabled ? 'secondary' : 'success'}
              size={'xs'}
              disabled={togglePlugin.isPending}
              loading={togglePlugin.isPending}
            >
              {t('common.yes')}
            </Button>
            <Button onClick={() => setToggleConfirm(false)} variant={'ghost'} size={'xs'}>
              {t('common.no')}
            </Button>
          </div>
        ) : deleteConfirm ? (
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
            <Button
              onClick={handleDelete}
              variant={'destructive'}
              size={'xs'}
              disabled={deletePlugin.isPending}
              loading={deletePlugin.isPending}
            >
              {t('common.yes')}
            </Button>
            <Button onClick={() => setDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
              {t('common.no')}
            </Button>
          </div>
        ) : (
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={'flex items-center'}>
                    <Switch checked={plugin.enabled} onCheckedChange={() => setToggleConfirm(true)} />
                  </div>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                  {plugin.enabled ? t('plugins.tooltipDisable') : t('plugins.tooltipEnable')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'}>
                    <Trash2 className={'size-4'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('plugins.tooltipDelete')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </FeatureCard.RowControl>
    </FeatureCard.Row>
  );
}
