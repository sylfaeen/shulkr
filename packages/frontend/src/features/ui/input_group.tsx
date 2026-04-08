import type { ReactNode } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';

type InputGroupProps = {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

export function InputGroup({ label, error, hint, required, children, className }: InputGroupProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className={'text-foreground text-sm font-medium'}>
          {label}
          {required && <span className={'text-destructive ml-1'}>*</span>}
        </label>
      )}
      {children}
      {error && <p className={'text-destructive text-sm'}>{error}</p>}
      {hint && !error && <p className={'text-muted-foreground text-sm'}>{hint}</p>}
    </div>
  );
}
