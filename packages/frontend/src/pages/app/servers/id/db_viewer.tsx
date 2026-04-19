import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Database } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useDownloadFile } from '@shulkr/frontend/hooks/use_files';
import { useSqlite } from '@shulkr/frontend/hooks/use_sqlite';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { DbViewerContent } from '@shulkr/frontend/features/db_viewer_content';

export function ServerDbViewerPage() {
  const { t } = useTranslation();
  const search: { path?: string } = useSearch({ strict: false });
  const filePath = search.path ?? null;
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');
  const filename = filePath ? filePath.split('/').pop() || '' : '';
  const parentDir = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) || '/' : '/';
  usePageTitle(server?.name ? `${server.name} • ${filename}` : filename);
  if (!filePath) return <PageError message={t('files.missingFilePath')} />;
  if (serverLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('files.invalidServerId')} />;
  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Database} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{filename}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <div className={'font-jetbrains mt-0.5 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'truncate'}>{filePath}</span>
            </div>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
        <ServerPageHeader.Actions>
          <Link to={'/app/servers/$id/files'} params={{ id: String(server.id) }} search={{ path: parentDir }}>
            <Button variant={'secondary'} size={'sm'} icon={ArrowLeft}>
              {t('files.backToFiles')}
            </Button>
          </Link>
        </ServerPageHeader.Actions>
      </ServerPageHeader>
      <PageContent fill>
        {server.status === 'running' && (
          <Alert variant={'warning'} className={'mb-4'}>
            <AlertTriangle className={'size-4'} />
            <AlertDescription>{t('files.dbViewer.serverRunningWarning')}</AlertDescription>
          </Alert>
        )}
        <ServerDbViewerContent serverId={server.id} {...{ filePath }} />
      </PageContent>
    </>
  );
}

function ServerDbViewerContent({ serverId, filePath }: { serverId: string; filePath: string }) {
  const sqlite = useSqlite(serverId, filePath);
  const { download } = useDownloadFile(serverId);
  return <DbViewerContent sqlite={sqlite} onDownload={() => download(filePath)} />;
}
