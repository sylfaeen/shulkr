import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@shulkr/frontend/lib/cn';

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot={'switch'}
      data-size={size}
      className={cn(
        'peer group/switch focus-visible:border-ring focus-visible:ring-ring/50 data-[unchecked]:bg-input inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-green-600 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 dark:data-[unchecked]:bg-white/30',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot={'switch-thumb'}
        className={cn(
          'bg-background dark:data-[unchecked]:bg-foreground pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[checked]:translate-x-[calc(100%-2px)] data-[unchecked]:translate-x-0 dark:data-[checked]:bg-white'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
