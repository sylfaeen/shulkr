import { useState, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3, Clock, Loader2, TrendingUp, Users, Zap } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@shulkr/frontend/features/ui/shadcn/chart';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  useActivity,
  usePeakHours,
  useSessionDuration,
  useAnalyticsSummary,
  useRetention,
} from '@shulkr/frontend/hooks/use_analytics';
import { Repeat } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { MetricsChart } from '@shulkr/frontend/pages/app/servers/features/metrics_chart';
import { GcPanel } from '@shulkr/frontend/features/gc/gc_panel';

type Period = '24h' | '7d' | '30d';

export function ServerAnalyticsPage() {
  const { id } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(server?.name ? `${server.name} — ${t('nav.analytics')}` : t('nav.analytics'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server) return <PageError />;

  return (
    <PageContent>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={BarChart3} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('analytics.title')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('analytics.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <div className={'space-y-8'}>
        <section className={'space-y-4'}>
          <h2 className={'text-sm font-semibold tracking-wide text-zinc-500 uppercase'}>{t('analytics.serverTitle')}</h2>
          <MetricsChart serverId={server.id} />
          <GcPanel serverId={server.id} />
        </section>
        <section className={'space-y-4'}>
          <h2 className={'text-sm font-semibold tracking-wide text-zinc-500 uppercase'}>{t('analytics.playerTitle')}</h2>
          <PlayerAnalyticsContent serverId={server.id} />
        </section>
      </div>
    </PageContent>
  );
}

function PlayerAnalyticsContent({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const PERIODS: Array<Period> = ['24h', '7d', '30d'];
  const [period, setPeriod] = useState<Period>('7d');

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary(serverId, period);
  const { data: activity, isLoading: activityLoading } = useActivity(serverId, period);
  const { data: peakHours, isLoading: peakLoading } = usePeakHours(serverId, period);
  const { data: sessionDuration, isLoading: durationLoading } = useSessionDuration(serverId, period);
  const { data: retention } = useRetention(serverId);

  const isLoading = summaryLoading || activityLoading || peakLoading || durationLoading;

  return (
    <div className={'space-y-6'}>
      <div className={'flex gap-1'}>
        {PERIODS.map((p) => (
          <Button key={p} variant={period === p ? 'secondary' : 'ghost'} size={'sm'} onClick={() => setPeriod(p)}>
            {p}
          </Button>
        ))}
      </div>
      {isLoading ? (
        <div className={'flex items-center justify-center py-16'}>
          <Loader2 className={'size-6 animate-spin text-zinc-400'} />
        </div>
      ) : (
        <>
          <SummaryCards {...{ summary, t }} />
          <div className={'grid gap-6 lg:grid-cols-2'}>
            <ChartCard title={t('analytics.activityTitle')} icon={TrendingUp}>
              <ActivityChart data={activity ?? []} />
            </ChartCard>
            <ChartCard title={t('analytics.durationTitle')} icon={Clock}>
              <DurationChart data={sessionDuration ?? []} />
            </ChartCard>
          </div>
          <ChartCard title={t('analytics.peakHoursTitle')} icon={Zap}>
            <PeakHoursHeatmap data={peakHours ?? []} {...{ t }} />
          </ChartCard>
          <ChartCard title={t('analytics.retentionTitle')} icon={Repeat}>
            <RetentionTable data={retention ?? []} {...{ t }} />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function SummaryCards({
  summary,
  t,
}: {
  summary: ReturnType<typeof useAnalyticsSummary>['data'];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (!summary) return null;

  const cards = [
    { label: t('analytics.uniquePlayers'), value: summary.uniquePlayers, icon: Users },
    { label: t('analytics.totalSessions'), value: summary.totalSessions, icon: BarChart3 },
    { label: t('analytics.avgDuration'), value: `${summary.avgDurationMinutes} min`, icon: Clock },
    { label: t('analytics.peakSimultaneous'), value: summary.peakSimultaneous, icon: Zap },
  ];

  return (
    <div className={'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
      {cards.map((card) => (
        <div key={card.label} className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
          <div className={'flex items-center gap-2 text-xs text-zinc-500'}>
            <card.icon className={'size-3.5'} />
            {card.label}
          </div>
          <p className={'mt-1 text-2xl font-semibold'}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: typeof TrendingUp; children: React.ReactNode }) {
  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'mb-3 flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
        <Icon className={'size-4'} />
        {title}
      </div>
      {children}
    </div>
  );
}

function ActivityChart({ data }: { data: Array<{ timestamp: string; playerCount: number }> }) {
  const chartData = useMemo(() => data.map((d) => ({ ...d, ts: d.timestamp })), [data]);

  if (chartData.length === 0) return <EmptyChart />;

  const activityConfig = {
    playerCount: { label: 'Players', color: 'oklch(0.65 0.2 250)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={activityConfig} className={'h-52 w-full'}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray={'3 3'} vertical={false} />
        <XAxis dataKey={'ts'} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey={'playerCount'}
          type={'monotone'}
          fill={'var(--color-playerCount)'}
          fillOpacity={0.15}
          stroke={'var(--color-playerCount)'}
          strokeWidth={1.5}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function DurationChart({ data }: { data: Array<{ date: string; avgMinutes: number }> }) {
  if (data.length === 0) return <EmptyChart />;

  const durationConfig = {
    avgMinutes: { label: 'Avg duration (min)', color: 'oklch(0.65 0.2 160)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={durationConfig} className={'h-52 w-full'}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray={'3 3'} vertical={false} />
        <XAxis dataKey={'date'} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey={'avgMinutes'} fill={'var(--color-avgMinutes)'} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function PeakHoursHeatmap({
  data,
  t,
}: {
  data: Array<{ dayOfWeek: number; hour: number; avgPlayers: number }>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const maxVal = useMemo(() => Math.max(...data.map((d) => d.avgPlayers), 1), [data]);

  const grid = useMemo(() => {
    const matrix: Array<Array<number>> = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const cell of data) {
      matrix[cell.dayOfWeek][cell.hour] = cell.avgPlayers;
    }
    return matrix;
  }, [data]);

  if (data.length === 0) return <EmptyChart />;

  return (
    <div className={'overflow-x-auto'}>
      <div className={'min-w-150'}>
        <div className={'mb-1 flex'}>
          <div className={'w-10 shrink-0'} />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className={'flex-1 text-center text-[10px] text-zinc-400'}>
              {h}
            </div>
          ))}
        </div>
        {grid.map((row, dayIdx) => (
          <div key={dayIdx} className={'flex items-center'}>
            <div className={'w-10 shrink-0 pr-2 text-right text-[11px] text-zinc-500'}>{DAY_LABELS[dayIdx]}</div>
            {row.map((val, hourIdx) => {
              const intensity = val / maxVal;
              return (
                <div
                  key={hourIdx}
                  className={'m-px flex-1 rounded-sm'}
                  style={{
                    height: 20,
                    backgroundColor: intensity > 0 ? `oklch(0.65 0.2 250 / ${0.1 + intensity * 0.8})` : 'transparent',
                  }}
                  title={`${DAY_LABELS[dayIdx]} ${hourIdx}h: ${val} ${t('analytics.players')}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RetentionTable({
  data,
  t,
}: {
  data: Array<{ weekStart: string; totalPlayers: number; retention: Array<number> }>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (data.length === 0) return <EmptyChart />;

  const maxWeeks = Math.max(...data.map((c) => c.retention.length));

  return (
    <div className={'overflow-x-auto'}>
      <table className={'w-full text-xs'}>
        <thead>
          <tr>
            <th className={'px-2 py-1 text-left font-medium text-zinc-500'}>{t('analytics.cohort')}</th>
            <th className={'px-2 py-1 text-right font-medium text-zinc-500'}>{t('analytics.players')}</th>
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} className={'px-1 py-1 text-center font-medium text-zinc-500'}>
                {i === 0 ? t('analytics.week0') : `+${i}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((cohort) => (
            <tr key={cohort.weekStart}>
              <td className={'px-2 py-1 font-medium'}>{cohort.weekStart}</td>
              <td className={'px-2 py-1 text-right text-zinc-500'}>{cohort.totalPlayers}</td>
              {Array.from({ length: maxWeeks }, (_, i) => {
                const pct = cohort.retention[i] ?? null;
                if (pct === null) {
                  return <td key={i} className={'px-1 py-1'} />;
                }
                const intensity = pct / 100;
                return (
                  <td
                    key={i}
                    className={'px-1 py-1 text-center'}
                    style={{
                      backgroundColor: intensity > 0 ? `oklch(0.65 0.2 150 / ${0.08 + intensity * 0.5})` : undefined,
                    }}
                    title={`${pct}%`}
                  >
                    {pct}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart() {
  const { t } = useTranslation();
  return (
    <div className={'flex h-52 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500'}>
      {t('analytics.noData')}
    </div>
  );
}
