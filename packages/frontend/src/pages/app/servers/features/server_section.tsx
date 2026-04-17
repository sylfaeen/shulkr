import type { ComponentProps, PropsWithChildren } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';

export function ServerSection({ children }: PropsWithChildren) {
  return <div className={'rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'}>{children}</div>;
}

ServerSection.Header = function ServerSectionHeader({ children }: PropsWithChildren) {
  return (
    <div
      className={
        'flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-6 sm:py-4 dark:border-white/10'
      }
    >
      {children}
    </div>
  );
};

ServerSection.HeaderGroup = function ServerSectionHeaderGroup({ ...props }: PropsWithChildren) {
  return <div className={'flex items-center gap-3'} {...props} />;
};

ServerSection.HeaderInfo = function ServerSectionHeaderInfo({ ...props }: PropsWithChildren) {
  return <div {...props} />;
};

ServerSection.Icon = function ServerSectionIcon({ icon: IconComponent }: { icon: LucideIcon }) {
  return <IconComponent className={'size-5 text-zinc-700 dark:text-zinc-300'} strokeWidth={2} />;
};

ServerSection.Title = function ServerSectionTitle({ ...props }: PropsWithChildren) {
  return <h2 className={'text-lg font-semibold text-zinc-900 dark:text-zinc-100'} {...props} />;
};

ServerSection.Description = function ServerSectionDescription({ ...props }: PropsWithChildren) {
  return <p className={'text-sm text-zinc-600 dark:text-zinc-400'} {...props} />;
};

ServerSection.Count = function ServerSectionCount({ ...props }: PropsWithChildren) {
  return <Badge {...props} />;
};

ServerSection.HeaderAction = function ServerSectionHeaderAction({ children }: PropsWithChildren) {
  return <>{children}</>;
};

ServerSection.Body = function ServerSectionBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />;
};

ServerSection.Empty = function ServerSectionEmpty({ ...props }: PropsWithChildren) {
  return (
    <div className={'relative overflow-hidden py-12'}>
      <div className={'absolute inset-0 bg-linear-to-b from-green-600/2 to-transparent'} />
      <div className={'relative flex flex-col items-center'} {...props} />
    </div>
  );
};

ServerSection.EmptyIcon = function ServerSectionEmptyIcon({ icon: IconComponent }: { icon: LucideIcon }) {
  return (
    <div className={'mb-3 flex size-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800'}>
      <IconComponent className={'size-6 text-zinc-300'} strokeWidth={1.5} />
    </div>
  );
};

ServerSection.EmptyTitle = function ServerSectionEmptyTitle({ ...props }: PropsWithChildren) {
  return <p className={'mt-2 font-medium text-zinc-600 dark:text-zinc-400'} {...props} />;
};

ServerSection.EmptyDescription = function ServerSectionEmptyDescription({ ...props }: PropsWithChildren) {
  return <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'} {...props} />;
};
