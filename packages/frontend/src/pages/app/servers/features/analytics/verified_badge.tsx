import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';

export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300',
        className
      )}
      title={t('agent.live.verifiedTooltip')}
    >
      <ShieldCheck className={'size-3'} />
      {t('agent.live.verified')}
    </span>
  );
}
