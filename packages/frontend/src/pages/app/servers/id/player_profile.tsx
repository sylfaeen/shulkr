import { useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Ban, Calendar, Clock, Loader2, User, Sword, Pickaxe, Hammer, Heart, Footprints, Skull } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shulkr/frontend/features/ui/shadcn/tabs';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { usePlayerProfile, usePlayerSessions, usePlayerModeration } from '@shulkr/frontend/hooks/use_player_profile';
import { useFileContent } from '@shulkr/frontend/hooks/use_files';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { formatPlaytime } from '@shulkr/frontend/lib/duration';

export function PlayerProfilePage() {
  const { id, playerName } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(playerName ? `${playerName} — ${t('nav.players')}` : t('nav.players'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server || !playerName) return <PageError />;

  return <ProfileContent serverId={server.id} {...{ playerName }} />;
}

function ProfileContent({ serverId, playerName }: { serverId: string; playerName: string }) {
  const { t, i18n } = useTranslation();
  const { data: profile, isLoading: profileLoading } = usePlayerProfile(serverId, playerName);
  const { data: sessionsData, isLoading: sessionsLoading } = usePlayerSessions(serverId, playerName);
  const { data: moderation } = usePlayerModeration(serverId, playerName);

  const statsPath = profile?.uuid ? `world/stats/${profile.uuid}.json` : null;
  const { data: statsFile } = useFileContent(serverId, statsPath);
  const mcStats = useMemo(() => (statsFile ? parseMinecraftStats(statsFile.content) : null), [statsFile]);

  if (profileLoading) return <ServerPageSkeleton />;
  if (!profile) return <PageError />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left className={'items-center!'}>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className={'mt-0.5 size-10 shrink-0 rounded-xl border border-black/6 dark:border-white/6'}
            />
          ) : (
            <ServerPageHeader.Icon icon={User} />
          )}
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{profile.name}</ServerPageHeader.PageName>
              {profile.online ? (
                <Badge variant={'success'}>{t('playerProfile.online')}</Badge>
              ) : (
                <Badge variant={'destructive'}>{t('playerProfile.offline')}</Badge>
              )}
              {moderation?.banned && <Badge variant={'destructive'}>{t('playerProfile.banned')}</Badge>}
            </ServerPageHeader.Heading>
            {profile.uuid && <p className={'font-jetbrains mt-0.5 text-xs text-zinc-400 dark:text-zinc-500'}>{profile.uuid}</p>}
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <div className={'space-y-4'}>
          <div className={'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
            <StatCard
              icon={Clock}
              label={t('playerProfile.totalPlaytime')}
              value={formatPlaytime(profile.totalPlaytimeMinutes)}
            />
            <StatCard icon={Calendar} label={t('playerProfile.sessions')} value={String(profile.sessionCount)} />
            <StatCard
              icon={Calendar}
              label={t('playerProfile.firstSeen')}
              value={new Date(profile.firstSeen).toLocaleDateString(i18n.language)}
            />
            <StatCard
              icon={Calendar}
              label={t('playerProfile.lastSeen')}
              value={new Date(profile.lastSeen).toLocaleDateString(i18n.language)}
            />
          </div>
          {mcStats && <GameStatsSection stats={mcStats} />}
          <FeatureCard.Stack>
            {moderation?.banned && (
              <FeatureCard>
                <FeatureCard.Header>
                  <FeatureCard.Content>
                    <FeatureCard.Title>{t('playerProfile.moderation')}</FeatureCard.Title>
                  </FeatureCard.Content>
                </FeatureCard.Header>
                <FeatureCard.Body>
                  <FeatureCard.Row>
                    <div className={'flex items-center gap-3'}>
                      <Ban className={'size-4 text-red-500'} />
                      <div>
                        <p className={'text-sm font-medium'}>{t('playerProfile.activeBan')}</p>
                        {moderation.banReason && <p className={'text-xs text-zinc-500'}>{moderation.banReason}</p>}
                        {moderation.banDate && (
                          <p className={'text-xs text-zinc-400 dark:text-zinc-500'}>
                            {t('playerProfile.bannedOn')} {new Date(moderation.banDate).toLocaleDateString(i18n.language)}
                            {moderation.banSource && ` — ${moderation.banSource}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </FeatureCard.Row>
                </FeatureCard.Body>
              </FeatureCard>
            )}
            <FeatureCard>
              <FeatureCard.Header>
                <FeatureCard.Content>
                  <FeatureCard.Title count={sessionsData?.total}>{t('playerProfile.sessionHistory')}</FeatureCard.Title>
                </FeatureCard.Content>
              </FeatureCard.Header>
              <FeatureCard.Body>
                {sessionsLoading ? (
                  <div className={'flex items-center justify-center py-8'}>
                    <Loader2 className={'size-4 animate-spin text-zinc-400'} />
                  </div>
                ) : !sessionsData?.sessions.length ? (
                  <FeatureCard.Empty icon={Clock} title={t('playerProfile.noSessions')} description={''} />
                ) : (
                  sessionsData.sessions.map((session) => (
                    <FeatureCard.Row key={session.id}>
                      <div className={'flex w-full items-center gap-3'}>
                        <Calendar className={'size-4 shrink-0 text-zinc-400'} />
                        <div className={'flex w-full items-center justify-between'}>
                          <p className={'text-sm'}>{new Date(session.joinedAt).toLocaleString(i18n.language)}</p>
                          {session.durationMinutes !== null && (
                            <p className={'text-xs text-zinc-400 dark:text-zinc-500'}>
                              {formatPlaytime(session.durationMinutes)}
                            </p>
                          )}
                        </div>
                      </div>
                    </FeatureCard.Row>
                  ))
                )}
              </FeatureCard.Body>
            </FeatureCard>
          </FeatureCard.Stack>
        </div>
      </PageContent>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'flex items-center gap-2 text-xs text-zinc-500'}>
        <Icon className={'size-3.5'} />
        {label}
      </div>
      <p className={'mt-1 text-lg font-semibold'}>{value}</p>
    </div>
  );
}

type MinecraftStats = {
  custom: Record<string, number>;
  mined: Record<string, number>;
  crafted: Record<string, number>;
  killed: Record<string, number>;
  killedBy: Record<string, number>;
};

function parseMinecraftStats(content: string): MinecraftStats | null {
  try {
    const raw = JSON.parse(content) as { stats?: Record<string, Record<string, number>> };
    if (!raw.stats) return null;

    const strip = (obj: Record<string, number> | undefined): Record<string, number> => {
      if (!obj) return {};
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key.replace('minecraft:', '')] = value;
      }
      return result;
    };

    return {
      custom: strip(raw.stats['minecraft:custom']),
      mined: strip(raw.stats['minecraft:mined']),
      crafted: strip(raw.stats['minecraft:crafted']),
      killed: strip(raw.stats['minecraft:killed']),
      killedBy: strip(raw.stats['minecraft:killed_by']),
    };
  } catch {
    return null;
  }
}

function formatMinecraftId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDistance(cm: number): string {
  if (cm >= 100_000) return `${(cm / 100_000).toFixed(1)} km`;
  if (cm >= 100) return `${(cm / 100).toFixed(0)} m`;
  return `${cm} cm`;
}

function formatTicks(ticks: number): string {
  const totalSeconds = Math.floor(ticks / 20);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function topEntries(record: Record<string, number>, count: number): Array<{ name: string; value: number }> {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([name, value]) => ({ name, value }));
}

function GameStatsSection({ stats }: { stats: MinecraftStats }) {
  const { t } = useTranslation();

  const heroStats = [
    { key: 'play_time', label: t('playerProfile.stats.playTime'), format: (v: number) => formatTicks(v), icon: Clock },
    { key: 'deaths', label: t('playerProfile.stats.deaths'), format: (v: number) => String(v), icon: Skull },
    { key: 'mob_kills', label: t('playerProfile.stats.mobKills'), format: (v: number) => String(v), icon: Sword },
    { key: 'player_kills', label: t('playerProfile.stats.playerKills'), format: (v: number) => String(v), icon: Sword },
  ].filter((s) => stats.custom[s.key] !== undefined);

  const detailStats = [
    { key: 'damage_dealt', label: t('playerProfile.stats.damageDealt'), format: (v: number) => String(Math.floor(v / 10)) },
    { key: 'damage_taken', label: t('playerProfile.stats.damageTaken'), format: (v: number) => String(Math.floor(v / 10)) },
    { key: 'jump', label: t('playerProfile.stats.jumps'), format: (v: number) => v.toLocaleString() },
  ].filter((s) => stats.custom[s.key] !== undefined);

  const distanceStats = [
    { key: 'walk_one_cm', label: t('playerProfile.stats.walked') },
    { key: 'sprint_one_cm', label: t('playerProfile.stats.sprinted') },
    { key: 'crouch_one_cm', label: t('playerProfile.stats.crouched') },
    { key: 'swim_one_cm', label: t('playerProfile.stats.swum') },
    { key: 'fly_one_cm', label: t('playerProfile.stats.flown') },
    { key: 'boat_one_cm', label: t('playerProfile.stats.byBoat') },
    { key: 'horse_one_cm', label: t('playerProfile.stats.byHorse') },
    { key: 'minecart_one_cm', label: t('playerProfile.stats.byMinecart') },
    { key: 'fall_one_cm', label: t('playerProfile.stats.fallen') },
  ].filter((d) => stats.custom[d.key] && stats.custom[d.key] > 0);

  const topMined = topEntries(stats.mined, 6);
  const topCrafted = topEntries(stats.crafted, 6);
  const topKilled = topEntries(stats.killed, 6);
  const topKilledBy = topEntries(stats.killedBy, 5);

  const hasGeneral = heroStats.length > 0;
  const hasCombat = topKilled.length > 0 || topKilledBy.length > 0;
  const hasItems = topMined.length > 0 || topCrafted.length > 0;

  if (!hasGeneral && !hasCombat && !hasItems) return null;

  return (
    <FeatureCard.Stack>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title>{t('playerProfile.stats.title')}</FeatureCard.Title>
          </FeatureCard.Content>
        </FeatureCard.Header>
        <FeatureCard.Body>
          <div className={'p-4'}>
            <Tabs defaultValue={'general'}>
              <TabsList variant={'line'}>
                {hasGeneral && (
                  <TabsTrigger value={'general'}>
                    <Heart className={'size-3.5'} />
                    {t('playerProfile.stats.general')}
                  </TabsTrigger>
                )}
                {hasCombat && (
                  <TabsTrigger value={'combat'}>
                    <Sword className={'size-3.5'} />
                    {t('playerProfile.stats.mobsKilled')}
                  </TabsTrigger>
                )}
                {hasItems && (
                  <TabsTrigger value={'items'}>
                    <Pickaxe className={'size-3.5'} />
                    {t('playerProfile.stats.topMined')}
                  </TabsTrigger>
                )}
              </TabsList>
              {hasGeneral && (
                <TabsContent value={'general'} className={'space-y-4 pt-4'}>
                  <div className={'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
                    {heroStats.map((s) => (
                      <div
                        key={s.key}
                        className={
                          'rounded-lg border border-black/5 bg-zinc-50 px-3 py-2.5 dark:border-white/5 dark:bg-zinc-800/60'
                        }
                      >
                        <div className={'flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500'}>
                          <s.icon className={'size-3'} />
                          {s.label}
                        </div>
                        <p className={'font-jetbrains mt-0.5 text-base font-semibold tabular-nums'}>
                          {s.format(stats.custom[s.key])}
                        </p>
                      </div>
                    ))}
                  </div>
                  {detailStats.length > 0 && (
                    <div className={'grid grid-cols-3 gap-x-4'}>
                      {detailStats.map((s) => (
                        <div
                          key={s.key}
                          className={
                            'flex items-center justify-between border-b border-dashed border-zinc-200 py-1.5 dark:border-zinc-700'
                          }
                        >
                          <span className={'text-xs text-zinc-500'}>{s.label}</span>
                          <span className={'font-jetbrains text-xs font-medium tabular-nums'}>
                            {s.format(stats.custom[s.key])}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {distanceStats.length > 0 && (
                    <div>
                      <div className={'mb-2 flex items-center gap-1.5'}>
                        <Footprints className={'size-3 text-zinc-400'} />
                        <span className={'text-[11px] font-semibold tracking-wider text-zinc-400 uppercase'}>
                          {t('playerProfile.stats.distances')}
                        </span>
                      </div>
                      <div className={'grid grid-cols-2 gap-x-4 sm:grid-cols-3'}>
                        {distanceStats.map((d) => (
                          <div
                            key={d.key}
                            className={
                              'flex items-center justify-between border-b border-dashed border-zinc-200 py-1.5 dark:border-zinc-700'
                            }
                          >
                            <span className={'text-xs text-zinc-500'}>{d.label}</span>
                            <span className={'font-jetbrains text-xs font-medium tabular-nums'}>
                              {formatDistance(stats.custom[d.key])}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              )}
              {hasCombat && (
                <TabsContent value={'combat'} className={'space-y-5 pt-4'}>
                  {topKilled.length > 0 && (
                    <RankedList
                      icon={Sword}
                      title={t('playerProfile.stats.mobsKilled')}
                      entries={topKilled}
                      barColor={'bg-emerald-500/15 dark:bg-emerald-400/10'}
                    />
                  )}
                  {topKilledBy.length > 0 && (
                    <RankedList
                      icon={Skull}
                      title={t('playerProfile.stats.killedBy')}
                      entries={topKilledBy}
                      barColor={'bg-red-500/15 dark:bg-red-400/10'}
                    />
                  )}
                </TabsContent>
              )}
              {hasItems && (
                <TabsContent value={'items'} className={'space-y-5 pt-4'}>
                  {topMined.length > 0 && (
                    <RankedList
                      icon={Pickaxe}
                      title={t('playerProfile.stats.topMined')}
                      entries={topMined}
                      barColor={'bg-amber-500/15 dark:bg-amber-400/10'}
                    />
                  )}
                  {topCrafted.length > 0 && (
                    <RankedList
                      icon={Hammer}
                      title={t('playerProfile.stats.topCrafted')}
                      entries={topCrafted}
                      barColor={'bg-blue-500/15 dark:bg-blue-400/10'}
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>
          </div>
        </FeatureCard.Body>
      </FeatureCard>
    </FeatureCard.Stack>
  );
}

function RankedList({
  icon: Icon,
  title,
  entries,
  barColor,
}: {
  icon: typeof Clock;
  title: string;
  entries: Array<{ name: string; value: number }>;
  barColor: string;
}) {
  const maxValue = entries[0]?.value ?? 1;

  return (
    <div>
      <div className={'mb-2 flex items-center gap-1.5'}>
        <Icon className={'size-3 text-zinc-400'} />
        <span className={'text-[11px] font-semibold tracking-wider text-zinc-400 uppercase'}>{title}</span>
      </div>
      <div className={'space-y-1'}>
        {entries.map((entry) => {
          const pct = Math.max((entry.value / maxValue) * 100, 2);
          return (
            <div key={entry.name} className={'group relative flex items-center gap-3 rounded-md px-2 py-1'}>
              <div className={cn('absolute inset-y-0 left-0 rounded-md transition-all', barColor)} style={{ width: `${pct}%` }} />
              <span className={'relative z-10 min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300'}>
                {formatMinecraftId(entry.name)}
              </span>
              <span className={'font-jetbrains relative z-10 shrink-0 text-xs font-medium tabular-nums'}>
                {entry.value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
