import { useState, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Globe, Check, HardDrive, LoaderCircle, RotateCcw, Trash2, Upload } from 'lucide-react';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useWorlds, useSetActiveWorld, useResetWorld } from '@shulkr/frontend/hooks/use_worlds';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { cn } from '@shulkr/frontend/lib/cn';

export function ServerWorldsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const serverId = id || '';
  const { data: server, isLoading: serverLoading } = useServer(serverId);

  usePageTitle(server?.name ? `${server.name} • ${t('nav.worlds')}` : t('nav.worlds'));

  if (serverLoading) return <PageLoader />;
  if (!server) return <PageError message={t('errors.generic')} />;

  const isStopped = server.status === 'stopped';

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Globe} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.worlds')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('worlds.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <WorldsSection {...{ serverId, isStopped }} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function WorldsSection({ serverId, isStopped }: { serverId: string; isStopped: boolean }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { data, isLoading } = useWorlds(serverId);

  const queryClient = useQueryClient();
  const setActive = useSetActiveWorld(serverId);
  const resetWorld = useResetWorld(serverId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetBackup, setResetBackup] = useState(true);

  const handleReset = async () => {
    if (!resetTarget) return;
    await resetWorld.mutateAsync({ worldName: resetTarget, createBackup: resetBackup });
    setResetTarget(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const formData = new FormData();
      formData.append('file', file);

      const worldName = file.name.replace(/\.zip$/i, '');
      const response = await fetch(`/api/servers/${serverId}/worlds/import?name=${encodeURIComponent(worldName)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        addToast({ type: 'success', title: t('worlds.importSuccess') });
        queryClient.invalidateQueries({ queryKey: ['worlds', serverId] }).then();
      } else {
        const err = await response.json();
        addToast({ type: 'error', title: err.message || t('worlds.importError') });
      }
    } catch {
      addToast({ type: 'error', title: t('worlds.importError') });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={data && data.worlds.length > 0 && data.worlds.length}>
              {t('worlds.title')}
            </FeatureCard.Title>
            <FeatureCard.Description>{t('worlds.subtitle')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions>
            <Button onClick={() => fileInputRef.current?.click()} disabled={!isStopped || importing} loading={importing}>
              <Upload className={'size-4'} />
              {t('worlds.import')}
            </Button>
            <input ref={fileInputRef} type={'file'} accept={'.zip'} onChange={handleImport} className={'hidden'} />
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {isLoading ? (
            <div className={'py-8 text-center'}>
              <LoaderCircle className={'mx-auto size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
            </div>
          ) : !data || data.worlds.length === 0 ? (
            <FeatureCard.Empty icon={Globe} title={t('worlds.noWorlds')} description={t('worlds.noWorldsDesc')} />
          ) : (
            data.worlds.map((world) => (
              <FeatureCard.Row key={world.name}>
                <div className={'flex items-center gap-3'}>
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg text-white',
                      world.type === 'nether' ? 'bg-red-600' : world.type === 'end' ? 'bg-purple-600' : 'bg-green-600'
                    )}
                  >
                    <Globe className={'size-4'} strokeWidth={2} />
                  </div>
                  <div>
                    <div className={'flex items-center gap-2'}>
                      <span className={'font-medium text-zinc-900 dark:text-zinc-100'}>{world.name}</span>
                      <Badge variant={'outline'}>{t(`worlds.type.${world.type}`)}</Badge>
                      {world.isActive && (
                        <Badge variant={'success'}>
                          <Check className={'mr-1 size-3'} />
                          {t('worlds.active')}
                        </Badge>
                      )}
                    </div>
                    <div className={'flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400'}>
                      <HardDrive className={'size-3'} strokeWidth={2} />
                      {formatSize(world.size)}
                    </div>
                  </div>
                </div>
                <FeatureCard.RowControl>
                  {!world.isActive && (
                    <Button
                      variant={'secondary'}
                      size={'xs'}
                      onClick={() => setActive.mutateAsync(world.name)}
                      disabled={setActive.isPending}
                      loading={setActive.isPending}
                    >
                      {t('worlds.activate')}
                    </Button>
                  )}
                  <Button
                    variant={'ghost-destructive'}
                    size={'icon-sm'}
                    onClick={() => setResetTarget(world.name)}
                    disabled={!isStopped}
                    title={isStopped ? t('worlds.reset') : t('worlds.stopFirst')}
                  >
                    <Trash2 className={'size-4'} />
                  </Button>
                </FeatureCard.RowControl>
              </FeatureCard.Row>
            ))
          )}
        </FeatureCard.Body>
      </FeatureCard>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('worlds.resetConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('worlds.resetWarning', { name: resetTarget })}</p>
            <Label className={'mt-4 flex items-center gap-2'}>
              <Checkbox checked={resetBackup} onCheckedChange={(v) => setResetBackup(!!v)} />
              <span className={'text-sm'}>{t('worlds.backupBefore')}</span>
            </Label>
          </DialogBody>
          <DialogFooter>
            <Button variant={'secondary'} onClick={() => setResetTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant={'destructive'} onClick={handleReset} disabled={resetWorld.isPending} loading={resetWorld.isPending}>
              <RotateCcw className={'size-4'} />
              {t('worlds.reset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
