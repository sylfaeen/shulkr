import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';

export function FeatureCard({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('overflow-hidden rounded-xl bg-zinc-50 p-1 shadow-inner dark:bg-zinc-800', className)} {...rest} />;
}

FeatureCard.Header = function FeatureCardHeader({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-between gap-x-6 gap-y-3 px-5 py-4', className)} {...rest} />;
};

FeatureCard.Content = function FeatureCardContent({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex-1', className)} {...rest} />;
};

type FeatureCardTitleProps = ComponentProps<'h3'> & {
  count?: ReactNode;
};

FeatureCard.Title = function FeatureCardTitle({ count, className, children, ...rest }: FeatureCardTitleProps) {
  return (
    <h3 className={cn('text-strong flex items-center gap-2 font-medium', className)} {...rest}>
      {children}
      {count ? <Badge variant={'secondary'}>{count}</Badge> : null}
    </h3>
  );
};

FeatureCard.Description = function FeatureCardDescription({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-zinc-600 dark:text-zinc-400', className)} {...rest} />;
};

FeatureCard.Actions = function FeatureCardActions({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-end gap-2', className)} {...rest} />;
};

FeatureCard.Body = function FeatureCardBody({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('shadow-inner-xs rounded-lg bg-white dark:bg-zinc-900', className)}>
      <div className={'divide-y divide-black/10 *:first:rounded-t-lg *:last:rounded-b-lg dark:divide-white/10'} {...rest} />
    </div>
  );
};

type FeatureCardRowLayout = 'row' | 'column';

type FeatureCardRowProps = ComponentProps<'div'> & {
  layout?: FeatureCardRowLayout;
  interactive?: boolean;
};

FeatureCard.Row = function FeatureCardRow({ layout = 'row', interactive = false, className, ...rest }: FeatureCardRowProps) {
  return (
    <div
      className={cn(
        'flex w-full justify-between gap-4 px-5 py-4',
        layout === 'row' && 'flex-row items-center sm:gap-8',
        layout === 'column' && 'flex-col items-start',
        interactive && 'hover:bg-card-hover',
        className
      )}
      {...rest}
    />
  );
};

type FeatureCardRowLabelProps = ComponentProps<'div'> & {
  description?: ReactNode;
};

FeatureCard.RowLabel = function FeatureCardRowLabel({ description, className, children, ...rest }: FeatureCardRowLabelProps) {
  return (
    <div className={cn('text-strong shrink text-sm font-medium', className)} data-slot={'label'} {...rest}>
      {children}
      {description && <p className={'text-weak mt-1 text-sm font-normal sm:text-pretty'}>{description}</p>}
    </div>
  );
};

FeatureCard.RowControl = function FeatureCardRowControl({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-start gap-1 sm:justify-end', className)}
      data-slot={'control'}
      {...rest}
    />
  );
};

type FeatureCardFooterProps = ComponentProps<'div'> & {
  alert?: boolean;
};

FeatureCard.Footer = function FeatureCardFooter({ className, alert = false, ...rest }: FeatureCardFooterProps) {
  return <div className={cn(alert ? 'px-0.5 pt-1 pb-0.5' : 'p-4', className)} {...rest} />;
};

FeatureCard.Stack = function FeatureCardStack({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('flex w-full flex-col gap-y-4', className)} {...rest} />;
};

type FeatureCardEmptyProps = PropsWithChildren<{
  icon: LucideIcon;
  title: string;
  description: string;
}>;

FeatureCard.Empty = function FeatureCardEmpty({ icon: Icon, title, description, children }: FeatureCardEmptyProps) {
  return (
    <FeatureCard.Row className={'relative overflow-hidden'}>
      <div className={'absolute inset-0 bg-linear-to-b from-black/2 to-transparent'} />
      <FeatureCard.Stack className={'items-center gap-y-0 py-10 text-center'}>
        <div className={'flex size-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800'}>
          <Icon className={'size-6 text-zinc-600 dark:text-zinc-400'} strokeWidth={1.5} />
        </div>
        <p className={'mt-6 font-medium'}>{title}</p>
        <p className={'mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'}>{description}</p>
        {children}
      </FeatureCard.Stack>
    </FeatureCard.Row>
  );
};
