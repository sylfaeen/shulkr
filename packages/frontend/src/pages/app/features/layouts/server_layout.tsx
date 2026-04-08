import { useMemo, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Archive,
  BookOpen,
  Clock,
  FolderOpen,
  Globe,
  Puzzle,
  ScrollText,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useSidebarItems, type SidebarNavSection } from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';
import { useServer } from '@shulkr/frontend/hooks/use_servers';

export function ServerLayout() {
  const { id } = useParams({ strict: false });
  const { data: server } = useServer(id || '');

  const navigate = useNavigate();

  useEffect(() => {
    if (server?.status === 'deleting') {
      navigate({ to: '/app/servers' }).then();
    }
  }, [server?.status, navigate]);

  const sections = useMemo(() => getServerNavSections(id || '', server?.name || ''), [id, server?.name]);
  const serverHeader = { backPath: '/app/servers', backLabel: 'servers' };

  useSidebarItems(sections, serverHeader);

  return (
    <main className={'flex min-h-0 flex-1'}>
      <Sidebar />
      <div className={'page layout-panel layout-server'}>
        <div className={'page-wrapper'}>
          <div className={'page-container'}>
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
}

function getServerNavSections(serverId: string, serverName: string): Array<SidebarNavSection> {
  const basePath = `/app/servers/${serverId}`;
  return [
    {
      section: serverName,
      items: [
        { key: 'console', path: basePath, exact: true, icon: Activity },
        { key: 'files', path: `${basePath}/files`, icon: FolderOpen },
        { key: 'plugins', path: `${basePath}/plugins`, icon: Puzzle },
        { key: 'backups', path: `${basePath}/backups`, icon: Archive },
        { key: 'players', path: `${basePath}/players`, icon: Users },
        { key: 'worlds', path: `${basePath}/worlds`, icon: Globe },
        { key: 'logs', path: `${basePath}/logs`, icon: ScrollText },
        { key: 'tasks', path: `${basePath}/tasks`, icon: Clock },
        {
          key: 'settings',
          path: `${basePath}/settings`,
          icon: SlidersHorizontal,
          children: [
            { key: 'settingsGeneral', path: `${basePath}/settings/general` },
            { key: 'settingsJars', path: `${basePath}/settings/jars` },
            { key: 'settingsJvm', path: `${basePath}/settings/jvm` },
            { key: 'settingsSftp', path: `${basePath}/settings/sftp` },
            { key: 'settingsDomains', path: `${basePath}/settings/domains` },
          ],
        },
        { key: 'docs', path: '/app/docs', icon: BookOpen, bottom: true },
      ],
    },
  ];
}
