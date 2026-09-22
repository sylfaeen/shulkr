import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Database, Eye, HardDrive, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
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
        <FeatureCard.Body>
          {isLoading || engineLoading ? (
            <FeatureCard.Row className={'py-2'}>
              <SkeletonList rows={2} className={'w-full'} />
            </FeatureCard.Row>
          ) : engineUnavailable ? (
            <FeatureCard.Empty
              icon={HardDrive}
              title={t('databases.engine.unavailableTitle')}
              description={
                engine?.state === 'installed_stopped'
                  ? t('databases.engine.stoppedDescription')
                  : t('databases.engine.unavailableDescription')
              }
            />
          ) : databases.length === 0 ? (
            <FeatureCard.Empty icon={Database} title={t('databases.list.empty')} description={t('databases.list.emptyHint')} />
          ) : (
            databases.map((database) => (
              <DatabaseRow key={database.id} remoteEnabled={engine?.remoteEnabled ?? false} {...{ database, serverId }} />
            ))
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <CreateDatabaseDialog open={createOpen} onOpenChange={() => setCreateOpen(false)} {...{ serverId, prefixHint }} />
    </>
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
  const [gateOpen, setGateOpen] = useState(false);
  const [rotateGateOpen, setRotateGateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);
  const revealCredentials = useRevealDatabaseCredentials();
  const rotatePassword = useRotateDatabasePassword(serverId);

  const handleReveal = async () => {
    setCredentials(await revealCredentials.mutateAsync(database.id));
  };

  const handleRotate = async () => {
    setCredentials(await rotatePassword.mutateAsync(database.id));
  };

  return (
    <div className={'border-b border-zinc-100 last:border-0 dark:border-zinc-800'}>
      <div className={'flex flex-wrap items-center gap-3 px-5 py-4'}>
        <Database className={'size-4 shrink-0 text-zinc-400'} />
        <div className={'min-w-0'}>
          <p className={'font-jetbrains truncate text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{database.dbName}</p>
          <p className={'truncate text-xs text-zinc-500 dark:text-zinc-400'}>
            {t('databases.list.userLine', { user: database.dbUser, host: database.host, port: database.port })}
          </p>
        </div>
        {database.accessCount > 0 && (
          <Badge variant={'secondary'}>{t('databases.list.accessCount', { count: database.accessCount })}</Badge>
        )}
        <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{formatSize(database.sizeBytes)}</span>
        <div className={'ml-auto flex items-center gap-1'}>
          {canReveal && (
            <Button
              size={'sm'}
              variant={'ghost'}
              icon={Eye}
              onClick={() => setGateOpen(true)}
              loading={revealCredentials.isPending}
            />
          )}
          {canRotate && (
            <Button
              size={'sm'}
              variant={'ghost'}
              icon={RefreshCw}
              onClick={() => setRotateGateOpen(true)}
              loading={rotatePassword.isPending}
            />
          )}
          {canDelete && (
            <Button size={'sm'} variant={'ghost'} icon={Trash2} iconClass={'text-red-500'} onClick={() => setDeleteOpen(true)} />
          )}
        </div>
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
