import { useTranslation } from 'react-i18next';
import type { AgentLive, AgentPlayerSnapshot, AgentWorldSnapshot } from '@shulkr/shared';
import { VerifiedBadge } from '@shulkr/frontend/pages/app/servers/features/analytics/verified_badge';
import { cn } from '@shulkr/frontend/lib/cn';

export function AgentLiveSections({ data }: { data: AgentLive }) {
  const isProxy = data.platform === 'velocity' || data.platform === 'waterfall';
  return (
    <div className={'space-y-4'}>
      <VerifiedHealthSection data={data} isProxy={isProxy} />
      {!isProxy && <WorldsLiveSection worlds={data.worlds ?? []} />}
      {isProxy && <ProxyBackendsSection backends={data.proxy_backends ?? []} />}
      <OnlinePlayersLiveSection players={data.players} isProxy={isProxy} />
    </div>
  );
}

function Section({ title, freshness, children }: { title: string; freshness?: string; children: React.ReactNode }) {
  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'mb-3 flex items-center justify-between gap-2'}>
        <div className={'flex items-center gap-2'}>
          <h3 className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{title}</h3>
          <VerifiedBadge />
        </div>
        {freshness && <span className={'text-[11px] text-zinc-500 dark:text-zinc-500'}>{freshness}</span>}
      </div>
      {children}
    </div>
  );
}

function VerifiedHealthSection({ data, isProxy }: { data: AgentLive; isProxy: boolean }) {
  const { t } = useTranslation();
  const heapPct = data.memory.heap_max > 0 ? (data.memory.heap_used / data.memory.heap_max) * 100 : 0;
  return (
    <Section title={t('agent.live.verifiedHealth')} freshness={formatFreshness(data.received_at, t)}>
      <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'}>
        {!isProxy && data.tps && (
          <Stat
            label={t('agent.live.tps')}
            value={formatNumber(data.tps.avg1m)}
            hint={`5s ${formatNumber(data.tps.avg5s)} · 15m ${formatNumber(data.tps.avg15m)}`}
          />
        )}
        {!isProxy && data.mspt && (
          <Stat
            label={t('agent.live.mspt')}
            value={`${formatNumber(data.mspt.avg1m)} ms`}
            hint={`5s ${formatNumber(data.mspt.avg5s)} · 15m ${formatNumber(data.mspt.avg15m)} ms`}
          />
        )}
        {isProxy && (
          <Stat
            label={t('agent.live.proxyPlayers')}
            value={String(data.players.length)}
            hint={t('agent.live.proxyPlayersHint')}
          />
        )}
        <Stat
          label={t('agent.live.heap')}
          value={`${formatBytes(data.memory.heap_used)} / ${formatBytes(data.memory.heap_max)}`}
          hint={`${heapPct.toFixed(1)}%`}
        />
        <Stat label={t('agent.live.uptime')} value={formatDuration(data.uptime_ms)} />
      </div>
    </Section>
  );
}

function ProxyBackendsSection({ backends }: { backends: Array<{ name: string; online_players: number; reachable: boolean }> }) {
  const { t } = useTranslation();
  if (backends.length === 0) return null;
  return (
    <Section title={t('agent.live.backends')}>
      <div className={'overflow-x-auto'}>
        <table className={'w-full text-sm'}>
          <thead>
            <tr className={'text-left text-xs text-zinc-500 dark:text-zinc-400'}>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.backend')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.playersShort')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.reachable')}</th>
            </tr>
          </thead>
          <tbody>
            {backends.map((b) => (
              <tr key={b.name} className={'border-t border-black/6 dark:border-white/6'}>
                <td className={'py-2 pr-4 font-medium'}>{b.name}</td>
                <td className={'py-2 pr-4 tabular-nums'}>{b.online_players}</td>
                <td className={'py-2 pr-4'}>
                  {b.reachable ? (
                    <span className={'text-emerald-600 dark:text-emerald-400'}>●</span>
                  ) : (
                    <span className={'text-zinc-400 dark:text-zinc-500'}>○</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function WorldsLiveSection({ worlds }: { worlds: Array<AgentWorldSnapshot> }) {
  const { t } = useTranslation();
  const sorted = [...worlds].sort((a, b) => b.entities - a.entities);
  if (sorted.length === 0) return null;
  return (
    <Section title={t('agent.live.worlds')}>
      <div className={'overflow-x-auto'}>
        <table className={'w-full text-sm'}>
          <thead>
            <tr className={'text-left text-xs text-zinc-500 dark:text-zinc-400'}>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.world')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.playersShort')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.entities')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.loadedChunks')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr key={w.name} className={'border-t border-black/6 dark:border-white/6'}>
                <td className={'py-2 pr-4 font-medium'}>{w.name}</td>
                <td className={'py-2 pr-4 tabular-nums'}>{w.players}</td>
                <td className={'py-2 pr-4 tabular-nums'}>{w.entities}</td>
                <td className={'py-2 pr-4 tabular-nums'}>{w.loaded_chunks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function OnlinePlayersLiveSection({ players, isProxy }: { players: Array<AgentPlayerSnapshot>; isProxy: boolean }) {
  const { t } = useTranslation();
  if (players.length === 0) return null;
  return (
    <Section title={t('agent.live.onlinePlayers')}>
      <div className={'overflow-x-auto'}>
        <table className={'w-full text-sm'}>
          <thead>
            <tr className={'text-left text-xs text-zinc-500 dark:text-zinc-400'}>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.player')}</th>
              <th className={'py-2 pr-4 font-medium'}>{isProxy ? t('agent.live.backend') : t('agent.live.world')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.ping')}</th>
              <th className={'py-2 pr-4 font-medium'}>{t('agent.live.uuid')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.uuid} className={'border-t border-black/6 dark:border-white/6'}>
                <td className={'py-2 pr-4 font-medium'}>{p.name}</td>
                <td className={'py-2 pr-4'}>{isProxy ? (p.backend ?? '—') : (p.world ?? '—')}</td>
                <td className={'py-2 pr-4 tabular-nums'}>{p.ping != null ? `${p.ping} ms` : '—'}</td>
                <td className={'font-jetbrains py-2 pr-4 text-xs text-zinc-500 dark:text-zinc-400'}>{p.uuid.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn('rounded-lg border border-black/6 bg-zinc-50 p-3 dark:border-white/6 dark:bg-zinc-800/50')}>
      <div className={'text-[11px] text-zinc-500 dark:text-zinc-400'}>{label}</div>
      <div className={'text-lg font-semibold text-zinc-800 tabular-nums dark:text-zinc-100'}>{value}</div>
      {hint && <div className={'text-[11px] text-zinc-500 dark:text-zinc-400'}>{hint}</div>}
    </div>
  );
}

function formatNumber(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MiB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatFreshness(iso: string, t: ReturnType<typeof useTranslation>['t']): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return '';
  if (diff < 10_000) return t('agent.live.updatedJustNow');
  return t('agent.live.updatedAgo', { count: Math.round(diff / 1000) });
}
