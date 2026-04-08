import type { PropsWithChildren } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';

type PageContentProps = PropsWithChildren<{
  fill?: boolean;
}>;

export function PageContent({ children, fill }: PageContentProps) {
  return (
    <div className={cn('content', fill && 'fill')}>
      <div className={'content-container'}>{children}</div>
    </div>
  );
}
