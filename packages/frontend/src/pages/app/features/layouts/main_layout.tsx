import { useMemo } from 'react';
import { Outlet } from '@tanstack/react-router';
import { BookOpen, Server, Settings, Users } from 'lucide-react';
import { useSidebarItems, type SidebarNavSection } from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';
import { useServers } from '@shulkr/frontend/hooks/use_servers';

export function MainLayout() {
  const { data: servers } = useServers();

  const sections = useMemo((): Array<SidebarNavSection> => {
    const serverChildren = servers?.map((s) => ({
      key: `server-${s.id}`,
      path: `/app/servers/${s.id}`,
      label: s.name,
    }));

    return [
      {
        items: [
          {
            key: 'servers',
            path: '/app/servers',
            icon: Server,
            children: serverChildren,
          },
          { key: 'users', path: '/app/users', icon: Users },
          {
            key: 'settings',
            path: '/app/settings',
            icon: Settings,
            children: [
              { key: 'settingsGeneral', path: '/app/settings/general' },
              { key: 'settingsEnvironment', path: '/app/settings/environment' },
              { key: 'settingsFirewall', path: '/app/settings/firewall' },
              { key: 'settingsSftp', path: '/app/settings/sftp' },
            ],
          },
          { key: 'docs', path: '/app/docs', icon: BookOpen, bottom: true },
        ],
      },
    ];
  }, [servers]);

  useSidebarItems(sections);
  return <MainLayoutContent />;
}

export function MainLayoutContent() {
  return (
    <main className={'flex min-h-0 flex-1'}>
      <Sidebar />
      <div className={'page layout-panel layout-main'}>
        <div className={'page-wrapper'}>
          <div className={'page-container'}>
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
}
