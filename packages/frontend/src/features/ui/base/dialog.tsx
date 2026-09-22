import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { ScrollArea } from '@shulkr/frontend/features/ui/base/scroll-area';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot={'dialog-trigger'} {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot={'dialog-close'} {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot={'dialog-overlay'}
      className={cn(
        'data-[open]:animate-overlay-in data-[closed]:animate-overlay-out fixed inset-0 z-50 bg-black/10 dark:bg-black/30',
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot={'dialog-content'}
        className={cn(
          'data-[open]:animate-dialog-in data-[closed]:animate-dialog-out fixed top-[50%] left-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg outline-none sm:w-full',
          className
        )}
        {...props}
      >
        <div
          className={
            'bg-background/60 flex w-full flex-col rounded-t-3xl rounded-b-none p-2 shadow-xs backdrop-blur-[1px] sm:rounded-3xl dark:bg-white/3'
          }
        >
          <div
            className={
              'bg-background group shadow-dialog relative flex flex-col overflow-hidden rounded-t-2xl rounded-b-none transition-all duration-300 sm:rounded-2xl forced-colors:outline'
            }
          >
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot={'dialog-close'}
                className={
                  "ring-offset-background focus:ring-ring data-[open]:bg-accent data-[open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                }
              >
                <XIcon />
                <span className={'sr-only'}>Close</span>
              </DialogPrimitive.Close>
            )}
          </div>
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot={'dialog-header'} className={cn('space-y-3 p-6 text-center text-base sm:text-left', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot={'dialog-footer'}
      className={cn('bg-background z-10 flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant={'outline'}>Close</Button>} />}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot={'dialog-title'}
      className={cn('text-[16px] leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot={'dialog-description'}
      className={cn('text-muted-foreground text-[14px]', className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <ScrollArea viewClassName={'max-h-150'}>
      <div data-slot={'dialog-body'} className={cn('space-y-4 px-6 py-0', className)} {...props} />
    </ScrollArea>
  );
}

function DialogError({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot={'dialog-error'}
      className={cn('border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogError,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
