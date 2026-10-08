import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@shulkr/frontend/lib/cn';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'border-red-500/20 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200 [&>svg]:text-red-600 dark:[&>svg]:text-red-500 *:data-[slot=alert-description]:text-red-800 dark:*:data-[slot=alert-description]:text-red-200',
        warning:
          'border-orange-500/20 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200 [&>svg]:text-orange-600 dark:[&>svg]:text-orange-500 *:data-[slot=alert-description]:text-orange-800 dark:*:data-[slot=alert-description]:text-orange-200',
        success:
          'border-green-500/20 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200 [&>svg]:text-green-600 dark:[&>svg]:text-green-500 *:data-[slot=alert-description]:text-green-800 dark:*:data-[slot=alert-description]:text-green-200',
        info: 'border-blue-500/20 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-500 *:data-[slot=alert-description]:text-blue-800 dark:*:data-[slot=alert-description]:text-blue-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot={'alert'} role={'alert'} className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot={'alert-title'}
      className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot={'alert-description'}
      className={cn('text-muted-foreground col-start-2 text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
