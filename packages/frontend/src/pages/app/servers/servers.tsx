import { useState, useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Server, Plus, Loader2, HardDrive } from 'lucide-react';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { Skeleton } from '@shulkr/frontend/features/ui/shadcn/skeleton';
import { useServers, useCreateServer } from '@shulkr/frontend/hooks/use_servers';
import { CreateServerDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_server_dialog';
import { WelcomeWizard } from '@shulkr/frontend/pages/app/servers/features/welcome_wizard';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiClient, raise } from '@shulkr/frontend/lib/api';
import { DocsLink } from '@shulkr/frontend/pages/app/features/docs_link';
import { ServerStatusIcon } from '@shulkr/frontend/pages/app/servers/features/server_status_badge';
import { formatUptime } from '@shulkr/frontend/lib/uptime';
import { useFiles, useDirectorySizes, formatFileSize } from '@shulkr/frontend/hooks/use_files';
import type { ServerResponse } from '@shulkr/shared';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';

export function ServersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const can = useHasPermission();
  const canCreate = can('servers:create');

  usePageTitle('shulkr • ' + t('nav.servers'));

  const { data: servers, isLoading, error } = useServers();
  const { data: versionInfo } = useQuery({
    queryKey: ['settings', 'versionInfo'],
    queryFn: async () => {
      const result = await apiClient.settings.getVersionInfo();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });

  const createServer = useCreateServer();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = () => {
    setFormError(null);
    setShowCreateDialog(true);
  };

  const handleCreateSubmit = async (data: {
    name: string;
    min_ram: string;
    max_ram: string;
    jvm_flags: string;
    java_port: number;
    auto_start: boolean;
  }) => {
    setFormError(null);
    try {
      const server = await createServer.mutateAsync(data);
      setShowCreateDialog(false);
      navigate({ to: '/app/servers/$id', params: { id: String(server.id) } }).then();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t('errors.generic'));
      }
    }
  };

  if (error) {
    return <PageError message={t('errors.generic')} />;
  }

  const showWizard = !isLoading && servers && servers.length === 0 && !showCreateDialog;

  if (showWizard) {
    return (
      <PageContent>
        <WelcomeWizard onSkip={handleCreate} />
      </PageContent>
    );
  }

  return (
    <PageContent>
      <div className={'space-y-6'}>
        <div className={'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
          <div>
            <div className={'flex items-center gap-2'}>
              <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>{t('servers.title')}</h1>
              <DocsLink path={'/guide/server-management'} />
            </div>
            <p className={'mt-1 text-zinc-600 dark:text-zinc-400'}>{t('servers.subtitle', 'Manage your Minecraft servers')}</p>
          </div>
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className={'size-4'} />
              {t('servers.addServer')}
            </Button>
          )}
        </div>
        <div className={'space-y-4'}>
          {isLoading && <ServerCardSkeletons />}
          {servers?.map((server: ServerResponse) => (
            <ServerCard key={server.id} ipAddress={versionInfo?.ipAddress ?? null} {...{ server }} />
          ))}
          {!isLoading && servers?.length === 0 && <EmptyState onCreate={handleCreate} />}
        </div>
        {showCreateDialog && (
          <CreateServerDialog
            onSubmit={handleCreateSubmit}
            onCancel={() => setShowCreateDialog(false)}
            isLoading={createServer.isPending}
            error={formError}
          />
        )}
      </div>
    </PageContent>
  );
}

function ServerCard({ server, ipAddress }: { server: ServerResponse; ipAddress: string | null }) {
  const { t } = useTranslation();

  const { data: files } = useFiles(server.id, '/');
  const { data: dirSizes } = useDirectorySizes(server.id, '/');

  const totalSize = useMemo(() => {
    if (!files) return null;
    return files.reduce((sum, f) => {
      if (f.type === 'directory') return sum + (dirSizes?.[f.name] ?? 0);
      return sum + f.size;
    }, 0);
  }, [files, dirSizes]);

  const isRunning = server.status === 'running';
  const isDeleting = server.status === 'deleting';
  const address = ipAddress ? `${ipAddress}:${server.java_port}` : `:${server.java_port}`;

  if (isDeleting) {
    return (
      <div
        className={'overflow-hidden rounded-xl border border-black/10 bg-white opacity-50 dark:border-white/10 dark:bg-zinc-900'}
      >
        <div className={'px-4 py-3'}>
          <div className={'flex items-center gap-3 sm:gap-4'}>
            <ServerStatusIcon status={server.status} />
            <div className={'flex-1'}>
              <h3 className={'font-semibold text-zinc-400'}>{server.name}</h3>
              <div className={'flex items-center gap-2 text-sm text-zinc-400'}>
                <Loader2 className={'size-3 animate-spin'} />
                <span>{t('servers.status.deleting')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        'overflow-hidden rounded-xl border border-black/10 bg-white transition-colors hover:bg-black/2 dark:border-white/10 dark:bg-zinc-900'
      }
    >
      <div className={'px-4 py-3'}>
        <Link to={'/app/servers/$id'} params={{ id: String(server.id) }} className={'group flex items-center gap-3 sm:gap-4'}>
          <ServerStatusIcon status={server.status} />
          <div>
            <h3 className={'font-semibold'}>{server.name}</h3>
            <div className={'flex flex-wrap gap-x-2 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span>{address}</span>
              {totalSize !== null && totalSize > 0 && (
                <>
                  <span>·</span>
                  <div className={'flex items-center gap-1.5'}>
                    <HardDrive className={'size-3'} strokeWidth={2} />
                    <span>{formatFileSize(totalSize)}</span>
                  </div>
                </>
              )}
              {isRunning && (
                <>
                  <span>·</span>
                  <span>CPU: {server.cpu !== null ? `${server.cpu.toFixed(1)}%` : '-'}</span>
                  <span>·</span>
                  <span>
                    {t('dashboard.players')}: {server.player_count}
                  </span>
                  {server.uptime && (
                    <>
                      <span>·</span>
                      <span>
                        {t('dashboard.uptime')}: {formatUptime(server.uptime)}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function ServerCardSkeletons() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
          className={'overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'}
        >
          <div className={'px-4 py-3'}>
            <div className={'flex items-start gap-3 sm:gap-4'}>
              <Skeleton className={'size-5 shrink-0 rounded-full'} />
              <div className={'space-y-2'}>
                <Skeleton className={'h-5 w-32'} />
                <Skeleton className={'h-4 w-56'} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className={'rounded-xl border border-black/10 bg-white p-12 text-center dark:border-white/10 dark:bg-zinc-900'}>
      <div className={'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600/10'}>
        <Server className={'size-8 text-green-600'} strokeWidth={1.5} />
      </div>
      <h3 className={'mb-2 font-semibold text-zinc-900 dark:text-zinc-100'}>{t('servers.noServers')}</h3>
      <p className={'mb-6 text-zinc-600 dark:text-zinc-400'}>
        {t('servers.noServersDescription', 'Get started by adding your first server')}
      </p>
      <Button onClick={onCreate}>
        <Plus className={'size-4'} />
        {t('servers.addServer')}
      </Button>
    </div>
  );
}
