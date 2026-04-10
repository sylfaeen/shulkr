import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@shulkr/frontend/features/ui/shadcn/chart';
import { useMetricsHistory, type MetricsPeriod } from '@shulkr/frontend/hooks/use_metrics_history';
import { BarChart3, Loader2 } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';

const PERIODS: Array<MetricsPeriod> = ['1h', '6h', '24h', '7d', '30d'];

const chartConfig = {
  cpu: {
    label: 'CPU',
    color: 'oklch(0.65 0.2 250)',
  },
  memoryPercent: {
    label: 'RAM',
    color: 'oklch(0.65 0.2 160)',
  },
  playerCount: {
    label: 'Players',
    color: 'oklch(0.65 0.2 30)',
  },
} satisfies ChartConfig;

type MetricsChartProps = {
  serverId: string;
  isRunning: boolean;
};

export function MetricsChart({ serverId, isRunning }: MetricsChartProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState<MetricsPeriod>('1h');
  const { data, isLoading } = useMetricsHistory(serverId, period);

  const chartData = useMemo(() => {
    if (!data?.points) return [];
    return data.points.map((point) => ({
      ...point,
      ts: parseTimestamp(point.timestamp),
    }));
  }, [data]);

  const domain = useMemo((): [number, number] => {
    const now = Date.now();
    return [now - periodToMs(period), now];
  }, [period]);

  if (!isRunning && !expanded) return null;

  return (
    <div className={'shrink-0'}>
      <button
        type={'button'}
        onClick={() => setExpanded(!expanded)}
        className={
          'flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
        }
      >
        <BarChart3 className={'size-3.5'} />
        {t('metrics.history')}
      </button>

      {expanded && (
        <div className={'mt-3 rounded-xl border border-black/6 bg-zinc-50/50 p-4 dark:border-white/6 dark:bg-zinc-900/50'}>
          <div className={'mb-3 flex items-center justify-between'}>
            <div className={'flex gap-1'}>
              {PERIODS.map((p) => (
                <Button key={p} variant={period === p ? 'secondary' : 'ghost'} size={'xs'} onClick={() => setPeriod(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className={'flex h-48 items-center justify-center'}>
              <Loader2 className={'size-5 animate-spin text-zinc-400'} />
            </div>
          ) : !data || data.points.length === 0 ? (
            <div className={'flex h-48 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500'}>
              {t('metrics.noData')}
            </div>
          ) : (
            <ChartContainer config={chartConfig} className={'h-48 w-full'}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray={'3 3'} vertical={false} />
                <XAxis
                  dataKey={'ts'}
                  type={'number'}
                  domain={domain}
                  tickFormatter={(v: number) => formatEpoch(v, period)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 'auto']} width={32} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_label, payload) => {
                        const point = payload[0]?.payload as { ts: number } | undefined;
                        return point ? formatEpoch(point.ts, period) : '';
                      }}
                    />
                  }
                />
                <Area
                  dataKey={'cpu'}
                  type={'monotone'}
                  fill={'var(--color-cpu)'}
                  fillOpacity={0.1}
                  stroke={'var(--color-cpu)'}
                  strokeWidth={1.5}
                />
                <Area
                  dataKey={'memoryPercent'}
                  type={'monotone'}
                  fill={'var(--color-memoryPercent)'}
                  fillOpacity={0.1}
                  stroke={'var(--color-memoryPercent)'}
                  strokeWidth={1.5}
                />
                <Area
                  dataKey={'playerCount'}
                  type={'monotone'}
                  fill={'var(--color-playerCount)'}
                  fillOpacity={0.1}
                  stroke={'var(--color-playerCount)'}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      )}
    </div>
  );
}

function periodToMs(period: MetricsPeriod): number {
  switch (period) {
    case '1h':
      return 3_600_000;
    case '6h':
      return 21_600_000;
    case '24h':
      return 86_400_000;
    case '7d':
      return 604_800_000;
    case '30d':
      return 2_592_000_000;
  }
}

function parseTimestamp(value: string): number {
  return new Date(value.replace(' ', 'T') + 'Z').getTime();
}

function formatEpoch(epochMs: number, period: MetricsPeriod): string {
  const date = new Date(epochMs);
  if (period === '7d' || period === '30d') {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${month}/${day} ${hour}h`;
  }
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
