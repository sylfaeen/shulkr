import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { cn } from '@shulkr/frontend/lib/cn';

export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                'inline-flex cursor-help items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300',
                className
              )}
            >
              <ShieldCheck className={'size-3'} />
              {t('agent.live.verified')}
            </span>
          }
        />
        <TooltipContent sideOffset={4}>{t('agent.live.verifiedTooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
