import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarProvider, useSidebar } from '@shulkr/frontend/pages/app/features/sidebar_context';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { cn } from '@shulkr/frontend/lib/cn';
import { ArrowRight, Download, Menu } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { data } = useQuery({
    queryKey: ['settings', 'versionInfo'],
    queryFn: async () => {
      const result = await apiClient.settings.getVersionInfo();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const hasNewVersion = data?.latestVersion && isNewerVersion(data.latestVersion, data.currentVersion);

  return (
    <SidebarProvider>
      <div className={cn('shulkr', hasNewVersion && 'new-version')}>
        {hasNewVersion ? <UpdateBanner {...{ data }} /> : null}
        <SidebarToggle />
        <div className={'flex min-h-0 flex-1 flex-col'}>{children}</div>
      </div>
    </SidebarProvider>
  );
}

type UpdateBannerProps = {
  data: { currentVersion: string; latestVersion: string | null; ipAddress: string | null };
};

function UpdateBanner({ data }: UpdateBannerProps) {
  const { t } = useTranslation();

  return (
    <div className={'h-10 shrink-0 border-b border-purple-200 bg-purple-100'}>
      <div className={'flex'}>
        <div className={'hidden w-[max(0px,calc(50%-400px-13rem))] shrink-0 lg:block'} />
        <div className={'flex max-w-325 flex-1 items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:pl-5 xl:pr-0'}>
          <div className={'flex items-center gap-2.5'}>
            <Download className={'size-4 shrink-0 text-purple-600'} strokeWidth={2} />
            <p className={'text-sm font-medium text-purple-800'}>{t('update.available', { version: data.latestVersion })}</p>
          </div>
          <a
            href={'/docs/guide/configuration'}
            target={'_blank'}
            rel={'noopener noreferrer'}
            className={
              'flex shrink-0 items-center gap-1 text-sm font-medium text-purple-700 transition-colors hover:text-purple-900'
            }
          >
            {t('update.howToUpdate')}
            <ArrowRight className={'size-4'} strokeWidth={2} />
          </a>
        </div>
      </div>
    </div>
  );
}

function SidebarToggle() {
  const { setMobileOpen } = useSidebar();

  return (
    <div className={'flex items-center justify-between border-b border-black/10 px-4 py-3 min-[960px]:hidden'}>
      <Link to={'/app'} className={'group flex items-center gap-2.5'}>
        <div
          className={
            'flex size-7 items-center justify-center rounded-md bg-linear-to-br from-green-500 to-amber-500 shadow-sm transition-shadow group-hover:shadow-md'
          }
        >
          <span className={'text-sm font-bold text-white'}>R</span>
        </div>
        <span className={'text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100'}>Shulkr</span>
      </Link>
      <Button onClick={() => setMobileOpen(true)} variant={'secondary'} size={'icon-sm'}>
        <Menu className={'size-4'} strokeWidth={2} />
      </Button>
    </div>
  );
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}
