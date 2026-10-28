import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleSlash, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { useTaskStats } from '@shulkr/frontend/hooks/use_tasks';
import { ReactNode } from 'react';
import { formatDuration } from '@shulkr/frontend/lib/duration';

export function TaskStatsCards({ serverId, taskId }: { serverId: string; taskId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTaskStats(serverId, taskId);

  if (isLoading) {
    return (
      <div className={'flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500'}>
        <Loader2 className={'size-3.5 animate-spin'} />
        {t('common.loading')}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={'grid grid-cols-2 gap-2 md:grid-cols-5'}>
      <StatCard label={t('tasks.stats.total')} value={data.total} />
      <StatCard
        label={t('tasks.stats.success')}
        value={data.success}
        icon={<CheckCircle2 className={'size-3.5 text-green-600'} />}
        accentClass={'text-green-600 dark:text-green-400'}
      />
      <StatCard
        label={t('tasks.stats.errors')}
        value={data.error}
        icon={<XCircle className={'size-3.5 text-red-500'} />}
        accentClass={'text-red-500 dark:text-red-400'}
      />
      <StatCard
        label={t('tasks.stats.skipped')}
        value={data.skipped}
        icon={<CircleSlash className={'size-3.5 text-zinc-400'} />}
        accentClass={'text-zinc-500 dark:text-zinc-400'}
      />
      <StatCard
        label={t('tasks.stats.avgDuration')}
        value={formatDuration(data.avgDurationMs, 'precise')}
        icon={<Clock className={'size-3.5 text-zinc-500'} />}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accentClass,
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
  accentClass?: string;
}) {
  return (
    <div className={'rounded-lg border border-black/6 bg-white/60 px-3 py-2 dark:border-white/6 dark:bg-zinc-900/40'}>
      <div className={'flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-500'}>
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'font-jetbrains mt-0.5 text-lg font-medium tabular-nums',
          accentClass ?? 'text-zinc-800 dark:text-zinc-200'
        )}
      >
        {value}
      </div>
    </div>
  );
}
