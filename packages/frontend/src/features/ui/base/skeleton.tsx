import { cn } from '@shulkr/frontend/lib/cn';

type SkeletonVariant = 'shimmer' | 'pulse';

function Skeleton({ className, variant = 'shimmer', ...props }: React.ComponentProps<'div'> & { variant?: SkeletonVariant }) {
  return (
    <div
      data-slot={'skeleton'}
      aria-busy={true}
      aria-live={'polite'}
      className={cn(
        'rounded-md',
        variant === 'shimmer'
          ? 'bg-zinc-200 motion-safe:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] motion-safe:bg-linear-to-r motion-safe:from-zinc-200 motion-safe:via-zinc-100 motion-safe:to-zinc-200 motion-safe:bg-[length:200%_100%] motion-reduce:animate-pulse dark:bg-zinc-800 dark:motion-safe:from-zinc-800 dark:motion-safe:via-zinc-700 dark:motion-safe:to-zinc-800'
          : 'animate-pulse bg-zinc-200 dark:bg-zinc-800',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonVariant };
