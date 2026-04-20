import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { cn } from '@shulkr/frontend/lib/cn';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@shulkr/frontend/features/ui/shadcn/chart';
import { useGcMetrics } from '@shulkr/frontend/hooks/use_gc';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';

const chartConfig = {
  durationMs: { label: 'Duration (ms)', color: 'oklch(0.65 0.2 30)' },
} satisfies ChartConfig;

const PERIODS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const;

export function GcPanel({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(24);
  const { data } = useGcMetrics(serverId, hours);
  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'flex items-center justify-between'}>
        <p className={'text-sm font-medium text-zinc-600 dark:text-zinc-400'}>{t('gc.title')}</p>
        <div className={'flex gap-1'}>
          {PERIODS.map((p) => (
            <Button
              key={p.hours}
              variant={hours === p.hours ? 'secondary' : 'ghost'}
              size={'xs'}
              onClick={() => setHours(p.hours)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      {data && data.totalPauses > 0 && (
        <>
          <div className={'mt-3 grid grid-cols-3 gap-3'}>
            <StatCard label={t('gc.totalPauses')} value={String(data.totalPauses)} />
            <StatCard label={t('gc.totalDuration')} value={`${data.totalDurationMs.toFixed(1)}ms`} />
            <StatCard label={t('gc.maxPause')} value={`${data.maxDurationMs.toFixed(1)}ms`} warn={data.maxDurationMs > 100} />
          </div>
          {data.points.length > 0 && (
            <div className={'mt-3'}>
              <ChartContainer config={chartConfig} className={'h-36 w-full'}>
                <BarChart data={data.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray={'3 3'} vertical={false} />
                  <XAxis
                    dataKey={'timestamp'}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(11, 16)}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey={'durationMs'} radius={[2, 2, 0, 0]}>
                    {data.points.map((entry, i) => (
                      <rect
                        key={i}
                        fill={
                          entry.durationMs > 100
                            ? 'oklch(0.65 0.2 25)'
                            : entry.durationMs > 50
                              ? 'oklch(0.65 0.2 60)'
                              : 'oklch(0.65 0.2 150)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </>
      )}
      {data && data.totalPauses === 0 && (
        <div className={'mt-3 flex h-36 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500'}>
          {t('gc.noPauses')}
        </div>
      )}
      {!data && (
        <div className={'mt-3 flex h-36 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500'}>
          {t('metrics.noData')}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50', warn && 'ring-1 ring-red-500/20')}>
      <p className={'text-[11px] text-zinc-500'}>{label}</p>
      <p className={cn('text-sm font-semibold', warn && 'text-red-600 dark:text-red-400')}>{value}</p>
    </div>
  );
}
