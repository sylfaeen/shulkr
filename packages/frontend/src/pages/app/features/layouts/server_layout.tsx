import { useMemo, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  Clock,
  FolderOpen,
  Puzzle,
  ScrollText,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  useSidebarItems,
  type SidebarNavSection,
  type SidebarNavItem,
  type SidebarNavChild,
} from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useHasGroupAccess } from '@shulkr/frontend/hooks/use_permissions';

export function ServerLayout() {
  const { id } = useParams({ strict: false });
  const { data: server } = useServer(id || '');
  const can = useHasGroupAccess();

  const navigate = useNavigate();

  useEffect(() => {
    if (server?.status === 'deleting') {
      navigate({ to: '/app/servers' }).then();
    }
  }, [server?.status, navigate]);

  const sections = useMemo(() => getServerNavSections(id || '', server?.name || '', can), [id, server?.name, can]);
  const serverHeader = { backPath: '/app/servers', backLabel: 'servers' };

  useSidebarItems(sections, serverHeader);

  return (
    <main id={'main-content'} className={'flex min-h-0 flex-1'}>
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

function getServerNavSections(
  serverId: string,
  serverName: string,
  can: (...perms: Array<string>) => boolean
): Array<SidebarNavSection> {
  const basePath = `/app/servers/${serverId}`;

  const items: Array<SidebarNavItem> = [];
  if (can('server:console', 'server:power')) items.push({ key: 'console', path: basePath, exact: true, icon: Activity });

  if (can('server:files:read', 'server:files:write')) items.push({ key: 'files', path: `${basePath}/files`, icon: FolderOpen });
  if (can('server:plugins')) items.push({ key: 'plugins', path: `${basePath}/plugins`, icon: Puzzle });
  if (can('server:backups')) items.push({ key: 'backups', path: `${basePath}/backups`, icon: Archive });
  if (can('server:players')) items.push({ key: 'players', path: `${basePath}/players`, icon: Users });
  if (can('server:players')) items.push({ key: 'analytics', path: `${basePath}/analytics`, icon: BarChart3 });
  if (can('server:files:read')) items.push({ key: 'logs', path: `${basePath}/logs`, icon: ScrollText });
  if (can('server:tasks')) items.push({ key: 'tasks', path: `${basePath}/tasks`, icon: Clock });

  const settingsChildren: Array<SidebarNavChild> = [];
  if (can('servers')) settingsChildren.push({ key: 'settingsGeneral', path: `${basePath}/settings/general` });
  if (can('server:jars')) settingsChildren.push({ key: 'settingsJars', path: `${basePath}/settings/jars` });
  if (can('server:jvm')) settingsChildren.push({ key: 'settingsJvm', path: `${basePath}/settings/jvm` });
  if (can('server:sftp')) settingsChildren.push({ key: 'settingsSftp', path: `${basePath}/settings/sftp` });
  if (can('server:domains')) settingsChildren.push({ key: 'settingsDomains', path: `${basePath}/settings/domains` });
  if (can('server:webhooks')) settingsChildren.push({ key: 'settingsWebhooks', path: `${basePath}/settings/webhooks` });
  if (can('server:alerts')) settingsChildren.push({ key: 'settingsAlerts', path: `${basePath}/settings/alerts` });

  if (settingsChildren.length > 0) {
    items.push({
      key: 'settings',
      path: `${basePath}/settings`,
      icon: SlidersHorizontal,
      children: settingsChildren,
    });
  }

  items.push({ key: 'docs', path: '/app/docs', icon: BookOpen, bottom: true });

  return [{ section: serverName, items }];
}
