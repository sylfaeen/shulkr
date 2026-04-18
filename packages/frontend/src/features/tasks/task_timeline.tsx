import { useTranslation } from 'react-i18next';
import { cn } from '@shulkr/frontend/lib/cn';
import { normalizeTaskStatus, type TaskExecution, type TaskExecutionStatus } from '@shulkr/frontend/hooks/use_tasks';

export function TaskTimeline({ executions, limit = 30 }: { executions: Array<TaskExecution>; limit?: number }) {
  const { t } = useTranslation();

  const slice = [...executions].sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()).slice(-limit);

  if (slice.length === 0) return null;

  return (
    <div>
      <div className={'mb-1.5 text-[11px] text-zinc-500 dark:text-zinc-500'}>
        {t('tasks.timeline.label', { count: slice.length })}
      </div>
      <div className={'flex items-center gap-0.5'}>
        {slice.map((exec) => (
          <TimelineCell key={exec.id} exec={exec} />
        ))}
      </div>
    </div>
  );
}

function TimelineCell({ exec }: { exec: TaskExecution }) {
  const { t } = useTranslation();
  const date = new Date(exec.executedAt).toLocaleString();
  const title = t(`tasks.timeline.tooltip`, {
    status: t(`tasks.executionStatus.${normalizeTaskStatus(exec.status)}`),
    date,
    duration: exec.duration,
  });

  return <span title={title} className={cn('h-5 max-w-2 min-w-1 flex-1 rounded-sm transition', colorForStatus(exec.status))} />;
}

function colorForStatus(status: TaskExecutionStatus): string {
  if (status === 'success') return 'bg-green-600/80 hover:bg-green-600';
  if (status === 'error' || status === 'failure') return 'bg-red-500/80 hover:bg-red-500';
  if (status === 'skipped') return 'bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500';
  if (status === 'running') return 'bg-blue-500/70 hover:bg-blue-500';
  return 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600';
}
