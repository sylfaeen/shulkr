import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Database } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useDatabases, useDownloadDatabase } from '@shulkr/frontend/hooks/use_databases';
import { useMariadb } from '@shulkr/frontend/hooks/use_mariadb';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { DbViewerContent } from '@shulkr/frontend/features/db_viewer_content';

export function ServerDatabaseViewerPage() {
  const { t } = useTranslation();
  const { id, databaseId } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');
  const { data, isLoading: databasesLoading } = useDatabases(id || '');
  const database = data?.databases.find((entry) => entry.id === Number(databaseId));

  usePageTitle(server?.name ? `${server.name} • ${database?.dbName ?? ''}` : (database?.dbName ?? ''));

  if (serverLoading || databasesLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('errors.generic')} />;
  if (!database) return <PageError message={t('databases.viewer.notFound')} />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Database} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{database.dbName}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <div className={'font-jetbrains mt-0.5 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'truncate'}>
                {database.dbUser} at {database.host}:{database.port}
              </span>
            </div>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
        <ServerPageHeader.Actions>
          <Link to={'/app/servers/$id/databases'} params={{ id: String(server.id) }}>
            <Button variant={'secondary'} size={'sm'} icon={ArrowLeft}>
              {t('databases.viewer.back')}
            </Button>
          </Link>
        </ServerPageHeader.Actions>
      </ServerPageHeader>
      <PageContent fill>
        <ServerDatabaseViewerContent databaseId={database.id} sizeBytes={database.sizeBytes} />
      </PageContent>
    </>
  );
}

function ServerDatabaseViewerContent({ databaseId, sizeBytes }: { databaseId: number; sizeBytes: number | null }) {
  const mariadb = useMariadb(databaseId, sizeBytes);
  const download = useDownloadDatabase();

  return <DbViewerContent sqlite={mariadb} onDownload={() => download(databaseId)} />;
}
