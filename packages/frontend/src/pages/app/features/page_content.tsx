import type { PropsWithChildren } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';

export function PageContent({ children, fill }: PropsWithChildren<{ fill?: boolean }>) {
  return (
    <div className={cn('content', fill && 'fill')}>
      <div className={'content-container'}>{children}</div>
    </div>
  );
}
