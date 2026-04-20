import { Outlet } from '@tanstack/react-router';
import { BookOpen, Download, Settings, Globe, Clock, Users } from 'lucide-react';
import { useSidebarItems, type SidebarNavSection } from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';

const docsNavItems: Array<SidebarNavSection> = [
  {
    section: 'Getting Started',
    items: [
      { key: 'docsIntroduction', path: '/app/docs/introduction', icon: BookOpen },
      { key: 'docsInstallation', path: '/app/docs/installation', icon: Download },
      { key: 'docsConfiguration', path: '/app/docs/configuration', icon: Settings },
    ],
  },
  {
    section: 'Features',
    items: [{ key: 'docsTasks', path: '/app/docs/tasks', icon: Clock }],
  },
  {
    section: 'Administration',
    items: [
      { key: 'docsUsers', path: '/app/docs/users', icon: Users },
      { key: 'docsDomain', path: '/app/docs/domain', icon: Globe },
    ],
  },
];

const docsHeader = { backPath: '/app', backLabel: 'dashboard' };

export function DocsLayout() {
  useSidebarItems(docsNavItems, docsHeader);
  return (
    <main className={'flex min-h-0 flex-1'}>
      <Sidebar />
      <div className={'page layout-doc'}>
        <div className={'page-wrapper'}>
          <div className={'page-container'}>
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
}
