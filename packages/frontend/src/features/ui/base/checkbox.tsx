import { CheckIcon, MinusIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { cn } from '@shulkr/frontend/lib/cn';

function Checkbox({ className, indeterminate, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot={'checkbox'}
      indeterminate={indeterminate}
      className={cn(
        'peer border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[checked]:border-primary dark:data-[checked]:bg-primary size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-500',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot={'checkbox-indicator'}
        className={'grid place-content-center text-current transition-none'}
      >
        {indeterminate ? <MinusIcon className={'size-3.5'} /> : <CheckIcon className={'size-3.5'} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
