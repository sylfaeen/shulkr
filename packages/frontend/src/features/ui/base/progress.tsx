import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

import { cn } from '@shulkr/frontend/lib/cn';

function Progress({ className, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      data-slot={'progress'}
      value={value}
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <ProgressPrimitive.Track className={'h-full w-full'}>
        <ProgressPrimitive.Indicator
          data-slot={'progress-indicator'}
          className={'bg-primary h-full w-full flex-1 transition-all'}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
