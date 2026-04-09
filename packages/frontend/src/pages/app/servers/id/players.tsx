import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useConsoleWebSocket } from '@shulkr/frontend/hooks/use_console';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PlayersPanel } from '@shulkr/frontend/pages/app/servers/features/players_panel';
import { WhitelistManager } from '@shulkr/frontend/pages/app/servers/features/whitelist_manager';
import { PlayerHistoryPanel } from '@shulkr/frontend/pages/app/servers/features/player_history';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerPlayersPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading } = useServer(id || '');
  const { playerDetails, sendCommand } = useConsoleWebSocket(server?.id || null);

  usePageTitle(server?.name ? `${server.name} • ${t('nav.players')}` : t('nav.players'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (isLoading) return <ServerPageSkeleton />;

  const isRunning = server.status === 'running';

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Users} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.players')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('players.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <div className={'space-y-6'}>
          <PlayersPanel defaultExpanded {...{ playerDetails, isRunning, sendCommand }} />
          <WhitelistManager serverId={server.id} />
          <PlayerHistoryPanel serverId={server.id} />
        </div>
      </PageContent>
    </>
  );
}
