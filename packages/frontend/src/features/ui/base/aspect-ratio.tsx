import * as React from 'react';

import { cn } from '@shulkr/frontend/lib/cn';

function AspectRatio({ ratio = 1, className, style, children, ...props }: React.ComponentProps<'div'> & { ratio?: number }) {
  return (
    <div
      data-slot={'aspect-ratio'}
      className={cn('relative w-full', className)}
      style={{ paddingBottom: `${100 / ratio}%`, ...style }}
      {...props}
    >
      <div className={'absolute inset-0'}>{children}</div>
    </div>
  );
}

export { AspectRatio };
