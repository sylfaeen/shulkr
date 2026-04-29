import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

import { cn } from '@shulkr/frontend/lib/cn';
import { toggleVariants } from '@shulkr/frontend/features/ui/base/toggle';

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 0,
});

type ToggleGroupProps<Value extends string> = ToggleGroupPrimitive.Props<Value> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  };

function ToggleGroup<Value extends string>({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: ToggleGroupProps<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot={'toggle-group'}
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
        className
      )}
      {...props}
    >
      <ToggleGroupContext value={{ variant, size, spacing }}>{children}</ToggleGroupContext>
    </ToggleGroupPrimitive>
  );
}

type ToggleGroupItemProps<Value extends string> = TogglePrimitive.Props<Value> & VariantProps<typeof toggleVariants>;

function ToggleGroupItem<Value extends string>({ className, children, variant, size, ...props }: ToggleGroupItemProps<Value>) {
  const context = React.use(ToggleGroupContext);
  return (
    <TogglePrimitive
      data-slot={'toggle-group-item'}
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        'w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10',
        'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
