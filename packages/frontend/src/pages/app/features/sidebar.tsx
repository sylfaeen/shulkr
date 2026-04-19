import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Server,
  Archive,
  AlertTriangle,
  Clock,
  LogOut,
  Settings,
  User,
  Bell,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shulkr/frontend/features/ui/shadcn/dropdown-menu';
import { cn } from '@shulkr/frontend/lib/cn';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { useLogout } from '@shulkr/frontend/hooks/use_auth';
import { LanguageSelectorCompact } from '@shulkr/frontend/features/language_selector';
import { ThemeToggle } from '@shulkr/frontend/features/theme_toggle';
import {
  useSidebar,
  type SidebarNavItem,
  type SidebarNavChild,
  type SidebarNavSection,
} from '@shulkr/frontend/pages/app/features/sidebar_context';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@shulkr/frontend/hooks/use_notifications';
import { Popover, PopoverContent, PopoverTrigger } from '@shulkr/frontend/features/ui/shadcn/popover';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { formatRelativeTime } from '@shulkr/frontend/lib/date';

export function Sidebar() {
  const { t } = useTranslation();
  const { sections, header, mobileOpen, setMobileOpen } = useSidebar();
  const location = useLocation();
  const { data: versionInfo } = useQuery({
    queryKey: ['settings', 'versionInfo'],
    queryFn: async () => {
      const result = await apiClient.settings.getVersionInfo();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => setMobileOpen(false), [location.pathname, setMobileOpen]);
  const allItems = sections.flatMap((s) => s.items);
  const bottomItems = allItems.filter((i) => i.bottom);
  const mainSections = sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.bottom) })).filter((s) => s.items.length > 0);
  return (
    <>
      {mobileOpen && <div className={'fixed inset-0 z-20 bg-black/40 min-[960px]:hidden'} onClick={() => setMobileOpen(false)} />}
      <aside className={cn('sidebar', mobileOpen && 'open')}>
        <div className={'flex shrink-0 items-center gap-2.5 px-5 pt-6 pb-4'}>
          <Link to={'/app'} className={'group flex items-center gap-2.5'}>
            <img src={'/shulkr.png'} alt={'Shulkr'} className={'size-6'} />
            <span className={'text-base font-semibold tracking-wide text-zinc-900 dark:text-zinc-100'}>shulkr</span>
          </Link>
          {versionInfo?.currentVersion && (
            <span className={'mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600'}>v{versionInfo.currentVersion}</span>
          )}
        </div>
        {header ? (
          <div className={'px-3 py-4'}>
            <Link
              to={header.backPath}
              className={
                'flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white'
              }
            >
              <ArrowLeft className={'size-3'} strokeWidth={2} />
              <span>{t(`nav.${header.backLabel}`, header.backLabel)}</span>
            </Link>
          </div>
        ) : (
          <div className={'h-4 w-full'} />
        )}
        <nav className={'flex-1 space-y-6 overflow-y-auto px-3'}>
          {mainSections.map((section, index) => (
            <SidebarSection key={section.section ?? index} {...{ section, location }} />
          ))}
        </nav>
        <div className={'shrink-0 space-y-px px-3 pb-2'}>
          {bottomItems.map((item) => (
            <SidebarItem key={item.key} {...{ item, location }} />
          ))}
          <div
            className={
              'mt-2 flex items-center justify-between border-t border-zinc-200/60 px-1 pt-3 pb-1 dark:border-zinc-700/60'
            }
          >
            <UserDropdown />
            <div className={'flex items-center gap-1.5'}>
              <NotificationBell />
              <ThemeToggle />
              <LanguageSelectorCompact />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function UserDropdown() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const user = useAuthStore((s) => s.user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type={'button'}
          className={
            'flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }
        >
          <User className={'size-4 text-zinc-500 dark:text-zinc-400'} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={'top'} align={'start'}>
        <DropdownMenuLabel>{user?.username || 'User'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: '/app/account' }).then()}>
          <Settings className={'size-4'} strokeWidth={2} />
          <span className={'font-medium'}>{t('account.menuSettings')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate()}
          className={'text-red-600 data-highlighted:bg-red-50 dark:data-highlighted:bg-red-950'}
        >
          <LogOut className={'size-4'} strokeWidth={2} />
          <span className={'font-medium'}>{t('common.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const { t } = useTranslation();
  const { data: unreadCount } = useUnreadCount();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();
  const count = unreadCount ?? 0;
  const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
    server_crash: Server,
    backup_success: Archive,
    backup_failure: Archive,
    alert_triggered: AlertTriangle,
    task_failure: Clock,
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex size-8 items-center justify-center rounded-lg transition-colors outline-none',
            'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700',
            'dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
          )}
        >
          <Bell className={'size-4'} />
          {count > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold',
                'bg-red-500 text-white'
              )}
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={'start'} className={'w-80 p-0'}>
        <div className={'border-border flex items-center justify-between border-b px-3 py-2'}>
          <span className={'text-sm font-semibold'}>{t('notifications.title')}</span>
          {count > 0 && (
            <Button variant={'ghost'} size={'xs'} onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} icon={CheckCheck} iconClass={'size-3.5'}>
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <div className={'max-h-80 overflow-y-auto'}>
          {isLoading ? (
            <div className={'flex items-center justify-center py-8'}>
              <Loader2 className={'size-4 animate-spin text-zinc-400'} />
            </div>
          ) : !data?.notifications.length ? (
            <p className={'py-8 text-center text-sm text-zinc-500'}>{t('notifications.empty')}</p>
          ) : (
            data.notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                    !n.read && 'bg-blue-50/50 dark:bg-blue-950/20'
                  )}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    if (n.link) navigate({ to: n.link }).then();
                  }}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', n.read ? 'text-zinc-400' : 'text-blue-500')} />
                  <div className={'min-w-0 flex-1'}>
                    <p className={cn('truncate text-sm', !n.read && 'font-medium')}>{n.title}</p>
                    <p className={'truncate text-xs text-zinc-500'}>{n.message}</p>
                  </div>
                  <span className={'shrink-0 text-[10px] text-zinc-400'}>{formatRelativeTime(n.createdAt)}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SidebarSection({ section, location }: { section: SidebarNavSection; location: { pathname: string } }) {
  return (
    <div>
      {section.section && (
        <div
          className={
            'px-2.5 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase first:pt-0 dark:text-zinc-500'
          }
        >
          {section.section}
        </div>
      )}
      {section.items.map((item) => (
        <SidebarItem key={item.key} {...{ item, location }} />
      ))}
    </div>
  );
}

function SidebarItem({ item, location }: { item: SidebarNavItem; location: { pathname: string } }) {
  const { t } = useTranslation();
  const isActive = item.exact
    ? location.pathname === item.path
    : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  return (
    <div>
      <Link
        to={item.path}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors',
          isActive ? 'bg-zinc-200 dark:bg-zinc-700' : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white'
        )}
      >
        <Icon className={'size-4 shrink-0'} strokeWidth={2} />
        <span>{t(`nav.${item.key}`, item.key)}</span>
      </Link>
      {hasChildren && isActive && <SidebarChildren items={item.children!} {...{ location }} />}
    </div>
  );
}

function SidebarChildren({ items, location }: { items: Array<SidebarNavChild>; location: { pathname: string } }) {
  const { t } = useTranslation();
  return (
    <div className={'relative ml-4 border-l border-zinc-200 py-0.5 dark:border-zinc-700'}>
      {items.map((child) => {
        const isChildActive = child.exact
          ? location.pathname === child.path
          : location.pathname === child.path || location.pathname.startsWith(child.path + '/');
        return (
          <Link
            key={child.key}
            to={child.path}
            className={cn(
              'relative block py-1 pr-2.5 pl-4 font-medium transition-colors',
              isChildActive
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            )}
          >
            {isChildActive && (
              <span className={'absolute top-1/2 left-[-0.5px] h-4 w-px -translate-y-1/2 bg-zinc-900 dark:bg-zinc-100'} />
            )}
            {child.label || t(`nav.${child.key}`, child.key)}
          </Link>
        );
      })}
    </div>
  );
}
