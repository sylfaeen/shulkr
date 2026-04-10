import type { PropsWithChildren } from 'react';
import { useParams } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useScrolled } from '@shulkr/frontend/hooks/use_scrolled';
import { DocsLink } from '@shulkr/frontend/pages/app/features/docs_link';

export function ServerPageHeader({ children }: PropsWithChildren) {
  const { ref, isScrolled } = useScrolled<HTMLDivElement>();

  return (
    <div className={cn('header', isScrolled && 'scrolled')} ref={ref}>
      <div className={'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>{children}</div>
    </div>
  );
}

ServerPageHeader.Left = function ServerPageHeaderLeft({ children }: PropsWithChildren) {
  return <div className={'flex min-w-0 items-start gap-3'}>{children}</div>;
};

ServerPageHeader.Icon = function ServerPageHeaderIcon({ icon: IconComponent }: { icon: LucideIcon }) {
  return (
    <div className={'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800'}>
      <IconComponent className={'size-5 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
    </div>
  );
};

ServerPageHeader.Info = function ServerPageHeaderInfo({ children }: PropsWithChildren) {
  return <div className={'min-w-0'}>{children}</div>;
};

ServerPageHeader.Heading = function ServerPageHeaderHeading({ children }: PropsWithChildren) {
  return <div className={'flex flex-wrap items-center gap-2'}>{children}</div>;
};

ServerPageHeader.Title = function ServerPageHeaderTitle({ children }: PropsWithChildren) {
  return <h1 className={'flex items-center font-medium tracking-tight'}>{children}</h1>;
};

ServerPageHeader.ServerName = function ServerPageHeaderServerName() {
  const { id } = useParams({ strict: false });
  const { data: server } = useServer(id || '');
  const isRunning = server?.status === 'running';

  return (
    <ServerPageHeader.Title>
      {isRunning && (
        <span className={'relative mr-2 inline-flex size-2.5 items-center justify-center'}>
          <span className={'absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75'} />
          <span className={'relative inline-flex size-2 rounded-full bg-green-500'} />
        </span>
      )}
      {server?.name || `Server #${server?.id}`}
    </ServerPageHeader.Title>
  );
};

ServerPageHeader.PageName = function ServerPageHeaderPageName({ children }: PropsWithChildren) {
  return (
    <>
      <span className={'text-[8px] text-zinc-400 dark:text-zinc-500'}>&bull;</span>
      {children}
    </>
  );
};

ServerPageHeader.Docs = function ServerPageHeaderDocs({ path }: { path: string }) {
  return <DocsLink {...{ path }} />;
};

ServerPageHeader.Description = function ServerPageHeaderDescription({ children }: PropsWithChildren) {
  return <p className={'mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'}>{children}</p>;
};

ServerPageHeader.Actions = function ServerPageHeaderActions({ children }: PropsWithChildren) {
  return <div className={'flex items-center justify-end gap-2'}>{children}</div>;
};
