import { useTranslation } from 'react-i18next';
import { ArrowRight, Globe } from 'lucide-react';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';


type ScheduleInfo =
  | { type: 'fixed'; hour: number; minute: number }
  | { type: 'recurring'; serverHours: Array<string>; localHours: Array<string> }
  | { type: 'frequent' }
  | null;

function parseSchedule(cron: string | undefined, diffHours: number): ScheduleInfo {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);

  let minuteStr: string;
  let hourStr: string;

  if (parts.length === 6) {
    [, minuteStr, hourStr] = parts;
  } else if (parts.length === 5) {
    [minuteStr, hourStr] = parts;
  } else {
    return null;
  }

  if (hourStr === '*' || minuteStr === '*' || minuteStr.includes('/')) {
    return { type: 'frequent' };
  }

  if (hourStr.startsWith('*/')) {
    const step = parseInt(hourStr.slice(2));
    if (isNaN(step) || step <= 0) return null;
    const minute = parseInt(minuteStr) || 0;
    const serverHours: Array<string> = [];
    const localHours: Array<string> = [];
    for (let h = 0; h < 24; h += step) {
      serverHours.push(formatTime(h, minute));
      localHours.push(formatTime((h + diffHours + 24) % 24, minute));
    }
    return { type: 'recurring', serverHours, localHours };
  }

  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);
  if (isNaN(hour) || isNaN(minute)) return null;

  return { type: 'fixed', hour, minute };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function ServerTimeHint({ serverTime, cronExpression }: { serverTime: string | undefined; cronExpression: string | undefined }) {
  const { t } = useTranslation();

  if (!serverTime) return null;

  const serverDate = new Date(serverTime);
  const now = new Date();
  const serverFormatted = serverDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const localFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const hasDiff = serverFormatted !== localFormatted;
  const diffHours = Math.round((now.getTime() - serverDate.getTime()) / 3_600_000);

  const schedule = parseSchedule(cronExpression, diffHours);

  if (!hasDiff) {
    return (
      <Alert variant={'info'} className={'mt-2.5'}>
        <Globe className={'size-4'} />
        <AlertDescription>
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-xs'}>{t('tasks.serverLabel')}</span>
            <span className={'font-jetbrains text-xs font-medium tabular-nums'}>{serverFormatted}</span>
          </div>
          <p className={'text-[11px] opacity-70'}>
            {schedule?.type === 'fixed'
              ? t('tasks.scheduleTimezoneSameWithSchedule', { time: formatTime(schedule.hour, schedule.minute) })
              : t('tasks.scheduleTimezoneSame', { time: serverFormatted })}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant={'warning'} className={'mt-2.5'}>
      <Globe className={'size-4'} />
      <AlertDescription>
        <p className={'text-xs leading-relaxed'}>
          {t('tasks.scheduleTimezoneDescription', { diff: `${diffHours >= 0 ? '+' : ''}${diffHours}h` })}
        </p>
        <div className={'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1'}>
          <div className={'flex items-center gap-1.5 rounded-md bg-orange-200/50 px-2 py-1'}>
            <span className={'text-xs'}>{t('tasks.serverLabel')}</span>
            <span className={'font-jetbrains text-xs font-semibold tabular-nums'}>{serverFormatted}</span>
          </div>
          <ArrowRight className={'size-3 opacity-40'} strokeWidth={2} />
          <div className={'flex items-center gap-1.5 rounded-md bg-orange-200/50 px-2 py-1'}>
            <span className={'text-xs'}>{t('tasks.localLabel')}</span>
            <span className={'font-jetbrains text-xs font-semibold tabular-nums'}>{localFormatted}</span>
            <span className={'font-jetbrains text-[11px] tabular-nums opacity-60'}>
              ({diffHours >= 0 ? '+' : ''}
              {diffHours}h)
            </span>
          </div>
        </div>
        <ScheduleExplanation {...{ schedule, diffHours, serverDate, t }} />
      </AlertDescription>
    </Alert>
  );
}

function ScheduleExplanation({
  schedule,
  diffHours,
  serverDate,
  t,
}: {
  schedule: ScheduleInfo;
  diffHours: number;
  serverDate: Date;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (!schedule) return null;

  if (schedule.type === 'fixed') {
    const serverHour = formatTime(schedule.hour, schedule.minute);
    const localDate = new Date(serverDate);
    localDate.setHours(schedule.hour, schedule.minute, 0, 0);
    const localTime = new Date(localDate.getTime() + diffHours * 3_600_000);
    const localHour = localTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    return <p className={'mt-1.5 text-[11px] opacity-70'}>{t('tasks.timezoneExactSchedule', { serverHour, localHour })}</p>;
  }

  if (schedule.type === 'recurring') {
    return (
      <div className={'mt-1.5 text-[11px] opacity-70'}>
        <p>{t('tasks.timezoneRecurringSchedule')}</p>
        <div className={'font-jetbrains mt-1 flex flex-wrap gap-1 tabular-nums'}>
          {schedule.serverHours.map((sh, i) => (
            <span key={sh} className={'rounded bg-orange-200/30 px-1.5 py-0.5'}>
              {sh} → {schedule.localHours[i]}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (schedule.type === 'frequent') {
    return <p className={'mt-1.5 text-[11px] opacity-70'}>{t('tasks.timezoneFrequentSchedule')}</p>;
  }

  return null;
}
