import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleSlash, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import {
  normalizeTaskStatus,
  type TaskExecution,
  type TaskExecutionStatus,
  type TaskStepResult,
} from '@shulkr/frontend/hooks/use_tasks';

export function ExecutionDetail({ exec }: { exec: TaskExecution }) {
  const { t } = useTranslation();
  const steps = exec.stepResults ?? [];
  const hasSteps = steps.length > 0;

  return (
    <div className={'mt-2 rounded-md border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-900/30'}>
      <div className={'grid gap-3 md:grid-cols-3'}>
        <DetailField label={t('tasks.executionDetail.status')}>
          <div className={'flex items-center gap-1.5'}>
            <StatusIcon status={exec.status} size={'sm'} />
            <span className={'text-xs'}>{t(`tasks.executionStatus.${normalizeTaskStatus(exec.status)}`)}</span>
          </div>
        </DetailField>
        <DetailField label={t('tasks.executionDetail.duration')}>
          <span className={'font-jetbrains text-xs tabular-nums'}>{t('tasks.duration', { ms: exec.duration })}</span>
        </DetailField>
        <DetailField label={t('tasks.executionDetail.executedAt')}>
          <span className={'font-jetbrains text-xs tabular-nums'}>{new Date(exec.executedAt).toLocaleString()}</span>
        </DetailField>
      </div>
      {exec.output && (
        <div className={'mt-3'}>
          <div className={'mb-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400'}>
            {t('tasks.executionDetail.output')}
          </div>
          <pre
            className={
              'font-jetbrains max-h-40 overflow-auto rounded-md bg-zinc-900/80 p-2.5 text-[11px] leading-relaxed text-zinc-100'
            }
          >
            {exec.output}
          </pre>
        </div>
      )}
      {hasSteps && (
        <div className={'mt-3'}>
          <div className={'mb-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400'}>
            {t('tasks.executionDetail.steps', { count: steps.length })}
          </div>
          <StepTimeline {...{ steps }} />
        </div>
      )}
    </div>
  );
}

function StepTimeline({ steps }: { steps: Array<TaskStepResult> }) {
  const { t } = useTranslation();

  return (
    <ol className={'space-y-1.5'}>
      {steps.map((step) => {
        const status = step.status as TaskExecutionStatus;
        return (
          <li
            key={step.step}
            className={
              'flex items-start gap-2 rounded-md border border-black/6 bg-white/60 p-2 dark:border-white/6 dark:bg-zinc-800/30'
            }
          >
            <span
              className={
                'font-jetbrains flex size-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400'
              }
            >
              {step.step + 1}
            </span>
            <StatusIcon status={status} size={'sm'} />
            <div className={'min-w-0 flex-1'}>
              <div className={'flex items-center gap-2'}>
                <span className={'text-xs font-medium text-zinc-700 dark:text-zinc-300'}>
                  {t(`tasks.stepTypes.${step.type}`, { defaultValue: step.type })}
                </span>
                <span className={'font-jetbrains text-[11px] text-zinc-500 tabular-nums dark:text-zinc-500'}>
                  {t('tasks.duration', { ms: step.durationMs })}
                </span>
              </div>
              {step.error && <div className={'mt-0.5 truncate text-[11px] text-red-400'}>{step.error}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={'text-[11px] font-medium text-zinc-500 dark:text-zinc-500'}>{label}</div>
      <div className={'mt-0.5'}>{children}</div>
    </div>
  );
}

export function StatusIcon({ status, size = 'md' }: { status: TaskExecutionStatus; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'size-3' : 'size-3.5';
  switch (status) {
    case 'success':
      return <CheckCircle2 className={cn(sizeClass, 'shrink-0 text-green-600')} />;
    case 'failure':
    case 'error':
      return <XCircle className={cn(sizeClass, 'shrink-0 text-red-500')} />;
    case 'running':
      return <Loader2 className={cn(sizeClass, 'shrink-0 animate-spin text-blue-500')} />;
    case 'pending':
      return <Clock className={cn(sizeClass, 'shrink-0 text-zinc-400 dark:text-zinc-500')} />;
    case 'skipped':
      return <CircleSlash className={cn(sizeClass, 'shrink-0 text-zinc-400 dark:text-zinc-500')} />;
  }
}
