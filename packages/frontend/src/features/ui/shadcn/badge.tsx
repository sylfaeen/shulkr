import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@shulkr/frontend/lib/cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 [a&]:hover:bg-zinc-300 dark:[a&]:hover:bg-zinc-600',
        secondary:
          'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 [a&]:hover:bg-zinc-300 dark:[a&]:hover:bg-zinc-600',
        destructive:
          'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 [a&]:hover:bg-red-200 dark:[a&]:hover:bg-red-500/20',
        success:
          'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 [a&]:hover:bg-green-200 dark:[a&]:hover:bg-green-500/20',
        warning:
          'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 [a&]:hover:bg-orange-200 dark:[a&]:hover:bg-orange-500/20',
        outline: 'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
      },
      size: {
        xs: 'px-2 py-0.5 text-xs',
        sm: 'px-2 py-1 text-sm',
        md: 'px-3 py-2',
        lg: 'px-4 py-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'xs',
    },
  }
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot={'badge'} data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
