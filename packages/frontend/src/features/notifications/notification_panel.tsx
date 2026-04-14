import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck, AlertTriangle, Server, Archive, Clock, Loader2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '@shulkr/frontend/hooks/use_notifications';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@shulkr/frontend/features/ui/shadcn/popover';

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  server_crash: Server,
  backup_success: Archive,
  backup_failure: Archive,
  alert_triggered: AlertTriangle,
  task_failure: Clock,
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { data: unreadCount } = useUnreadCount();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();

  const count = unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex size-8 items-center justify-center rounded-lg transition-colors',
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
      <PopoverContent align={'end'} className={'w-80 p-0'}>
        <div className={'flex items-center justify-between border-b px-3 py-2'}>
          <span className={'text-sm font-semibold'}>{t('notifications.title')}</span>
          {count > 0 && (
            <Button variant={'ghost'} size={'xs'} onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className={'size-3.5'} />
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
                    if (n.link) navigate({ to: n.link });
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
