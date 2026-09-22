import { cn } from '@shulkr/frontend/lib/cn';
import { Skeleton } from '@shulkr/frontend/features/ui/base/skeleton';

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900/50', className)}>
      <div className={'flex items-center gap-3'}>
        <Skeleton className={'size-10 rounded-lg'} />
        <div className={'flex-1 space-y-2'}>
          <Skeleton className={'h-4 w-1/2'} />
          <Skeleton className={'h-3 w-2/3'} />
        </div>
      </div>
      <div className={'mt-4 space-y-2'}>
        <Skeleton className={'h-3 w-full'} />
        <Skeleton className={'h-3 w-4/5'} />
      </div>
    </div>
  );
}

const TABLE_COLUMN_WIDTHS = ['w-12', 'w-28', 'w-20'];

export function SkeletonTable({ rows = 5, columns = 3, className }: { rows?: number; columns?: number; className?: string }) {
  const trailing = Math.max(columns - 1, 0);

  return (
    <div className={className}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className={'flex items-center gap-3 border-b border-black/10 px-3 py-1.5 last:border-b-0 sm:px-4 dark:border-white/10'}
        >
          <div className={'flex min-w-0 flex-1 items-center gap-2.5'}>
            <Skeleton className={'size-7 shrink-0 rounded-md'} />
            <Skeleton className={'h-3.5 w-2/5'} />
          </div>
          {Array.from({ length: trailing }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                'h-3.5 shrink-0',
                TABLE_COLUMN_WIDTHS[colIndex % TABLE_COLUMN_WIDTHS.length],
                colIndex < trailing - 1 && 'hidden sm:block'
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Mirrors a card row rather than a detached card: the lists this stands in for are separated rows inside one container.
export function SkeletonListRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-4 px-4 py-3', className)}>
      <Skeleton className={'size-9 shrink-0 rounded-lg'} />
      <div className={'flex-1 space-y-1.5'}>
        <Skeleton className={'h-3.5 w-2/5'} />
        <Skeleton className={'h-3 w-3/5'} />
      </div>
      <Skeleton className={'h-7 w-16 shrink-0 rounded-md'} />
    </div>
  );
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-black/4 dark:divide-white/6', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div
      className={cn('space-y-3 rounded-lg border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900/40', className)}
    >
      <div className={'flex items-center justify-between'}>
        <Skeleton className={'h-4 w-1/3'} />
        <Skeleton className={'h-7 w-24 rounded-md'} />
      </div>
      <div className={'flex h-40 items-end gap-1.5'}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className={'flex-1'} style={{ height: `${40 + ((i * 13) % 50)}%` }} />
        ))}
      </div>
    </div>
  );
}
