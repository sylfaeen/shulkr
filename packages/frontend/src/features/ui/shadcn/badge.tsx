import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@shulkr/frontend/lib/cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        success:
          'bg-green-600 text-white focus-visible:ring-green-600/20 dark:bg-green-600/60 dark:focus-visible:ring-green-600/40 [a&]:hover:bg-green-600/90',
        warning:
          'bg-orange-600 text-white focus-visible:ring-orange-600/20 dark:bg-orange-600/60 dark:focus-visible:ring-orange-600/40 [a&]:hover:bg-orange-600/90',
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
      variant: 'secondary',
      size: 'xs',
    },
  }
);

function Badge({
  className,
  variant = 'secondary',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
