import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Database, Download, Eye, HardDrive, Plus, RefreshCw, TableProperties, Trash2 } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { Skeleton } from '@shulkr/frontend/features/ui/base/skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import {
  useDatabaseEngine,
  useDatabases,
  useDownloadDatabase,
  useRevealDatabaseCredentials,
  useRotateDatabasePassword,
} from '@shulkr/frontend/hooks/use_databases';
import { CreateDatabaseDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_database_dialog';
import { DeleteDatabaseDialog } from '@shulkr/frontend/pages/app/servers/dialogs/delete_database_dialog';
import { DatabaseAccesses } from '@shulkr/frontend/pages/app/servers/features/database_accesses';
import { DatabaseCredentialsPanel, buildPluginSnippet } from '@shulkr/frontend/pages/app/servers/features/database_credentials';
import type { DatabaseCredentials, ServerDatabaseResponse } from '@shulkr/shared';

export function ServerDatabasesPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.databases')}` : t('nav.databases'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('errors.generic')} />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Database} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('databases.title')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs page={'Databases'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('databases.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <DatabasesSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function DatabasesSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canCreate = can('server:databases:create');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: engine, isLoading: engineLoading } = useDatabaseEngine();
  const { data, isLoading } = useDatabases(serverId);
  const databases: Array<ServerDatabaseResponse> = data?.databases ?? [];
  // The prefix is minted server-side on the first database, so the preview is only available once one exists.
  const prefixHint = databases.length > 0 ? databases[0].dbName.split('_')[1] : null;
  const engineUnavailable = !engineLoading && engine?.state !== 'running';

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={databases.length > 0 && databases.length}>{t('databases.list.title')}</FeatureCard.Title>
            <FeatureCard.Description>{t('databases.list.description')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions>
            {canCreate && !engineUnavailable && (
              <Button onClick={() => setCreateOpen(true)} icon={Plus}>
                {t('databases.list.add')}
              </Button>
            )}
          </FeatureCard.Actions>
        </FeatureCard.Header>
        {isLoading || engineLoading ? (
          <DatabaseListSkeleton />
        ) : engineUnavailable ? (
          <FeatureCard.Body>
            <FeatureCard.Empty
              icon={HardDrive}
              title={t('databases.engine.unavailableTitle')}
              description={
                engine?.state === 'installed_stopped'
                  ? t('databases.engine.stoppedDescription')
                  : t('databases.engine.unavailableDescription')
              }
            />
          </FeatureCard.Body>
        ) : databases.length === 0 ? (
          <FeatureCard.Body>
            <FeatureCard.Empty icon={Database} title={t('databases.list.empty')} description={t('databases.list.emptyHint')} />
          </FeatureCard.Body>
        ) : (
          <div className={'space-y-2'}>
            {databases.map((database) => (
              <DatabaseRow key={database.id} remoteEnabled={engine?.remoteEnabled ?? false} {...{ database, serverId }} />
            ))}
          </div>
        )}
      </FeatureCard>
      <CreateDatabaseDialog open={createOpen} onOpenChange={() => setCreateOpen(false)} {...{ serverId, prefixHint }} />
    </>
  );
}

// Mirrors the real card: same rounding, same padding, same inner rule, so nothing shifts when the data lands.
function DatabaseListSkeleton() {
  return (
    <div className={'space-y-2'}>
      {[0, 1].map((key) => (
        <div key={key} className={'shadow-inner-xs overflow-hidden rounded-lg bg-white dark:bg-zinc-900'}>
          <div className={'flex items-center gap-3 px-5 py-4'}>
            <Skeleton className={'size-4 shrink-0 rounded'} />
            <div className={'flex-1 space-y-1.5'}>
              <Skeleton className={'h-3.5 w-52'} />
              <Skeleton className={'h-3 w-64'} />
            </div>
            <Skeleton className={'h-3 w-14 shrink-0'} />
            <Skeleton className={'h-7 w-40 shrink-0 rounded-md'} />
          </div>
          <div className={'border-border/60 border-t px-5 py-3'}>
            <Skeleton className={'h-3 w-32'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DatabaseRow({
  database,
  serverId,
  remoteEnabled,
}: {
  database: ServerDatabaseResponse;
  serverId: string;
  remoteEnabled: boolean;
}) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canReveal = can('server:databases:reveal');
  const canRotate = can('server:databases:rotate');
  const canDelete = can('server:databases:delete');
  const canManageAccess = can('server:databases:access');
  const canBrowse = can('server:databases:browse');
  const [gateOpen, setGateOpen] = useState(false);
  const [rotateGateOpen, setRotateGateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);
  const revealCredentials = useRevealDatabaseCredentials();
  const rotatePassword = useRotateDatabasePassword(serverId);
  const download = useDownloadDatabase();

  const handleReveal = async () => {
    setCredentials(await revealCredentials.mutateAsync(database.id));
  };

  const handleRotate = async () => {
    setCredentials(await rotatePassword.mutateAsync(database.id));
  };

  return (
    <div className={'shadow-inner-xs overflow-hidden rounded-lg bg-white dark:bg-zinc-900'}>
      <div className={'flex flex-wrap items-center gap-3 px-5 py-4'}>
        <Database className={'size-4 shrink-0 text-zinc-500 dark:text-zinc-400'} />
        <div className={'min-w-0'}>
          <p className={'font-jetbrains truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100'}>{database.dbName}</p>
          <p className={'truncate text-xs text-zinc-500 dark:text-zinc-400'}>
            {t('databases.list.userLine', { user: database.dbUser, host: database.host, port: database.port })}
          </p>
        </div>
        {database.accessCount > 0 && (
          <Badge variant={'secondary'}>{t('databases.list.accessCount', { count: database.accessCount })}</Badge>
        )}
        <span className={'ml-auto text-xs text-zinc-400 dark:text-zinc-500'}>{formatSize(database.sizeBytes)}</span>
        <TooltipProvider delay={300}>
          <div className={'flex items-center gap-1'}>
            {canBrowse && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      to={'/app/servers/$id/databases/$databaseId'}
                      params={{ id: serverId, databaseId: String(database.id) }}
                    >
                      <Button size={'sm'} variant={'ghost'} icon={TableProperties} aria-label={t('databases.actions.browse')} />
                    </Link>
                  }
                />
                <TooltipContent>{t('databases.actions.browse')}</TooltipContent>
              </Tooltip>
            )}
            {canReveal && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size={'sm'}
                      variant={'ghost'}
                      icon={Eye}
                      aria-label={t('databases.actions.reveal')}
                      onClick={() => setGateOpen(true)}
                      loading={revealCredentials.isPending}
                    />
                  }
                />
                <TooltipContent>{t('databases.actions.reveal')}</TooltipContent>
              </Tooltip>
            )}
            {canBrowse && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size={'sm'}
                      variant={'ghost'}
                      icon={Download}
                      aria-label={t('databases.actions.download')}
                      onClick={() => download(database.id)}
                    />
                  }
                />
                <TooltipContent>{t('databases.actions.download')}</TooltipContent>
              </Tooltip>
            )}
            {canRotate && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size={'sm'}
                      variant={'ghost'}
                      icon={RefreshCw}
                      aria-label={t('databases.actions.rotate')}
                      onClick={() => setRotateGateOpen(true)}
                      loading={rotatePassword.isPending}
                    />
                  }
                />
                <TooltipContent>{t('databases.actions.rotate')}</TooltipContent>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size={'sm'}
                      variant={'ghost'}
                      icon={Trash2}
                      iconClass={'text-red-500'}
                      aria-label={t('databases.actions.delete')}
                      onClick={() => setDeleteOpen(true)}
                    />
                  }
                />
                <TooltipContent>{t('databases.actions.delete')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>
      {credentials && (
        <div className={'px-5 pb-4'}>
          <DatabaseCredentialsPanel
            credentials={credentials}
            snippet={{ label: t('databases.dialog.pluginSnippet'), content: buildPluginSnippet(credentials) }}
          />
        </div>
      )}
      {canManageAccess && <DatabaseAccesses databaseId={database.id} {...{ serverId, remoteEnabled }} />}
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        scope={'database-credentials'}
        title={t('databases.reveal.title')}
        description={t('databases.reveal.description')}
        onConfirm={handleReveal}
      />
      <PasswordGate
        open={rotateGateOpen}
        onOpenChange={setRotateGateOpen}
        scope={'database-credentials'}
        destructive
        title={t('databases.rotate.title')}
        description={t('databases.rotate.description')}
        confirmLabel={t('databases.rotate.confirm')}
        onConfirm={handleRotate}
      />
      <DeleteDatabaseDialog open={deleteOpen} onOpenChange={() => setDeleteOpen(false)} {...{ database, serverId }} />
    </div>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
