import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';

import { cn } from '@shulkr/frontend/lib/cn';

function Label({ className, light, ...props }: React.ComponentProps<typeof LabelPrimitive.Root> & { light?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'block gap-2 text-sm select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        light ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400',
        className
      )}
      {...props}
    />
  );
}

export { Label };
