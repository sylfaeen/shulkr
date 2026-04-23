import { Outlet } from '@tanstack/react-router';
import {
  BookOpen,
  Download,
  Settings,
  Globe,
  Clock,
  Users,
  Shield,
  Server,
  Terminal,
  FolderOpen,
  Puzzle,
  Container,
  Code,
  Gauge,
  LifeBuoy,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { docsNavigation } from '@shulkr/shared';
import { useSidebarItems, type SidebarNavSection } from '@shulkr/frontend/pages/app/features/sidebar_context';
import { Sidebar } from '@shulkr/frontend/pages/app/features/sidebar';

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Download,
  Settings,
  Globe,
  Clock,
  Users,
  Shield,
  Server,
  Terminal,
  FolderOpen,
  Puzzle,
  Container,
  Code,
  Gauge,
  LifeBuoy,
};

const docsNavItems: Array<SidebarNavSection> = docsNavigation.map((section) => ({
  section: section.section,
  items: section.items.map((item) => ({
    key: `docs${item.slug.charAt(0).toUpperCase()}${item.slug.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`,
    path: `/app/docs/${item.slug}`,
    icon: ICON_MAP[item.icon] ?? HelpCircle,
  })),
}));

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
