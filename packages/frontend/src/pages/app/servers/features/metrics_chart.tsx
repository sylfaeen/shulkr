import { useState } from 'react';
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
              <AreaChart data={data.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray={'3 3'} vertical={false} />
                <XAxis
                  dataKey={'timestamp'}
                  tickFormatter={(v: string) => formatTimestamp(v, period)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 'auto']} width={32} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(label: string) => formatTimestamp(label as string, period)} />}
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

function formatTimestamp(value: string, period: MetricsPeriod): string {
  if (period === '7d' || period === '30d') {
    // "2026-04-08 14" or "2026-04-08 14:30" → "04/08 14h"
    const match = value.match(/(\d{2})-(\d{2})\s+(\d{2})/);
    if (match) return `${match[1]}/${match[2]} ${match[3]}h`;
  }
  // "2026-04-08 14:30" → "14:30"
  const timeMatch = value.match(/(\d{2}:\d{2})$/);
  if (timeMatch) return timeMatch[1];
  return value;
}
