import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';

type EmptyStateVariant = 'default' | 'compact' | 'inline';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}) {
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-black/15 bg-zinc-50/50 px-4 py-3 dark:border-white/15 dark:bg-zinc-900/30',
          className
        )}
      >
        <Icon className={'size-5 shrink-0 text-zinc-500 dark:text-zinc-500'} strokeWidth={1.5} />
        <div className={'min-w-0 flex-1'}>
          <div className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{title}</div>
          {description && <div className={'truncate text-xs text-zinc-500 dark:text-zinc-500'}>{description}</div>}
        </div>
        {action && <div className={'shrink-0'}>{action}</div>}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed border-black/10 bg-zinc-50/50 px-6 py-6 text-center dark:border-white/10 dark:bg-zinc-900/30',
          className
        )}
      >
        <div className={'flex size-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800'}>
          <Icon className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={1.5} />
        </div>
        <div>
          <p className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{title}</p>
          {description && <p className={'mt-0.5 text-xs text-zinc-600 dark:text-zinc-400'}>{description}</p>}
        </div>
        {action && <div className={'mt-1'}>{action}</div>}
      </div>
    );
  }

  return (
    <div className={cn('relative flex w-full flex-col items-center py-10 text-center', className)}>
      <div className={'flex size-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800'}>
        <Icon className={'size-6 text-zinc-600 dark:text-zinc-400'} strokeWidth={1.5} />
      </div>
      <p className={'mt-6 font-medium text-zinc-800 dark:text-zinc-200'}>{title}</p>
      {description && <p className={'mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'}>{description}</p>}
      {action && <div className={'mt-4'}>{action}</div>}
    </div>
  );
}

export type { EmptyStateVariant };
