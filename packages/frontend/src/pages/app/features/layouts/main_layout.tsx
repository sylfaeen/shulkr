import { useMemo } from 'react';
import { Outlet } from '@tanstack/react-router';
import { BookOpen, Server, Settings, Users } from 'lucide-react';
import {
  useSidebarItems,
  type SidebarNavSection,
  type SidebarNavChild,
} from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';
import { useServers } from '@shulkr/frontend/hooks/use_servers';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';

export function MainLayout() {
  const { data: servers } = useServers();
  const can = useHasPermission();

  const sections = useMemo((): Array<SidebarNavSection> => {
    const serverChildren = servers?.map((s) => ({
      key: `server-${s.id}`,
      path: `/app/servers/${s.id}`,
      label: s.name,
    }));

    const settingsChildren: Array<SidebarNavChild> = [];
    if (can('settings:general')) settingsChildren.push({ key: 'settingsGeneral', path: '/app/settings/general' });
    if (can('settings:environment')) settingsChildren.push({ key: 'settingsEnvironment', path: '/app/settings/environment' });
    if (can('settings:firewall')) settingsChildren.push({ key: 'settingsFirewall', path: '/app/settings/firewall' });
    if (can('settings:general')) settingsChildren.push({ key: 'settingsDatabase', path: '/app/settings/database' });

    const items = [
      {
        key: 'servers',
        path: '/app/servers',
        icon: Server,
        children: serverChildren,
      },
    ];

    if (can('users:manage')) {
      items.push({ key: 'users', path: '/app/users', icon: Users, children: undefined });
    }

    if (settingsChildren.length > 0) {
      items.push({
        key: 'settings',
        path: '/app/settings',
        icon: Settings,
        children: settingsChildren,
      });
    }

    return [
      {
        items: [...items, { key: 'docs', path: '/app/docs', icon: BookOpen, bottom: true, children: undefined }],
      },
    ];
  }, [servers, can]);

  useSidebarItems(sections);
  return <MainLayoutContent />;
}

export function MainLayoutContent() {
  return (
    <main id={'main-content'} className={'flex min-h-0 flex-1'}>
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
