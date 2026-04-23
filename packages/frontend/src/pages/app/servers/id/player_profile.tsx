import { useMemo, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { getFontEmbedCSS, toPng } from 'html-to-image';
import { toast } from 'sonner';
import {
  Ban,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  History,
  LogIn,
  LogOut,
  User,
  Sword,
  Pickaxe,
  Hammer,
  Heart,
  Footprints,
  Skull,
} from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
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
import { formatDuration } from '@shulkr/frontend/lib/duration';
import { MinecraftIcon } from '@shulkr/frontend/features/ui/minecraft_icon';

export function PlayerProfilePage() {
  const { id, playerName } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');
  usePageTitle(playerName ? `${playerName}: ${t('nav.players')}` : t('nav.players'));
  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server || !playerName) return <PageError />;
  return <ProfileContent serverId={server.id} serverName={server.name} {...{ playerName }} />;
}

function ProfileContent({ serverId, serverName, playerName }: { serverId: string; serverName: string; playerName: string }) {
  const { t, i18n } = useTranslation();
  const { data: profile, isLoading: profileLoading } = usePlayerProfile(serverId, playerName);
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
              value={formatDuration(profile.totalPlaytimeMinutes * 60_000, 'playtime')}
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
          {mcStats && (
            <GameStatsSection stats={mcStats} playerName={profile.name} avatarUrl={profile.avatarUrl} {...{ serverName }} />
          )}
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
                            {moderation.banSource && `, ${moderation.banSource}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </FeatureCard.Row>
                </FeatureCard.Body>
              </FeatureCard>
            )}
            <SessionHistoryPanel {...{ serverId, playerName }} />
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
  broken: Record<string, number>;
  used: Record<string, number>;
  pickedUp: Record<string, number>;
  dropped: Record<string, number>;
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
      broken: strip(raw.stats['minecraft:broken']),
      used: strip(raw.stats['minecraft:used']),
      pickedUp: strip(raw.stats['minecraft:picked_up']),
      dropped: strip(raw.stats['minecraft:dropped']),
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

const TIME_STATS = new Set([
  'play_time',
  'play_one_minute',
  'time_since_death',
  'time_since_rest',
  'total_world_time',
  'sneak_time',
]);

const DAMAGE_STATS = new Set([
  'damage_dealt',
  'damage_taken',
  'damage_absorbed',
  'damage_blocked_by_shield',
  'damage_dealt_absorbed',
  'damage_dealt_resisted',
  'damage_resisted',
]);

function formatCustomStat(key: string, value: number): string {
  if (key.endsWith('_one_cm')) return formatDistance(value);
  if (TIME_STATS.has(key)) return formatTicks(value);
  if (DAMAGE_STATS.has(key)) return Math.floor(value / 10).toLocaleString();
  return value.toLocaleString();
}

const CUSTOM_STAT_I18N_KEYS: Record<string, string> = {
  play_time: 'playTime',
  play_one_minute: 'playTime',
  deaths: 'deaths',
  mob_kills: 'mobKills',
  player_kills: 'playerKills',
  damage_dealt: 'damageDealt',
  damage_taken: 'damageTaken',
  jump: 'jumps',
  walk_one_cm: 'walked',
  sprint_one_cm: 'sprinted',
  crouch_one_cm: 'crouched',
  swim_one_cm: 'swum',
  fly_one_cm: 'flown',
  boat_one_cm: 'byBoat',
  horse_one_cm: 'byHorse',
  minecart_one_cm: 'byMinecart',
  fall_one_cm: 'fallen',
};

// Labels mirroring the Minecraft client's in-game "Statistics" screen for stats not
// covered by the dedicated i18n keys. Fallback is a humanized form of the raw id.
const CUSTOM_STAT_LABELS: Record<string, string> = {
  animals_bred: 'Animals Bred',
  aviate_one_cm: 'Distance by Elytra',
  bell_ring: 'Bells Rung',
  clean_armor: 'Armor Cleaned',
  clean_banner: 'Banners Cleaned',
  clean_shulker_box: 'Shulker Boxes Cleaned',
  climb_one_cm: 'Distance Climbed',
  damage_absorbed: 'Damage Absorbed',
  damage_blocked_by_shield: 'Damage Blocked by Shield',
  damage_dealt_absorbed: 'Damage Dealt (Absorbed)',
  damage_dealt_resisted: 'Damage Dealt (Resisted)',
  damage_resisted: 'Damage Resisted',
  drop: 'Items Dropped',
  eat_cake_slice: 'Cake Slices Eaten',
  enchant_item: 'Items Enchanted',
  fill_cauldron: 'Cauldrons Filled',
  fish_caught: 'Fish Caught',
  interact_with_anvil: 'Interactions with Anvil',
  interact_with_beacon: 'Interactions with Beacon',
  interact_with_blast_furnace: 'Interactions with Blast Furnace',
  interact_with_brewingstand: 'Interactions with Brewing Stand',
  interact_with_campfire: 'Interactions with Campfire',
  interact_with_cartography_table: 'Interactions with Cartography Table',
  interact_with_crafting_table: 'Interactions with Crafting Table',
  interact_with_furnace: 'Interactions with Furnace',
  interact_with_grindstone: 'Interactions with Grindstone',
  interact_with_lectern: 'Interactions with Lectern',
  interact_with_loom: 'Interactions with Loom',
  interact_with_smithing_table: 'Interactions with Smithing Table',
  interact_with_smoker: 'Interactions with Smoker',
  interact_with_stonecutter: 'Interactions with Stonecutter',
  inspect_dispenser: 'Dispensers Searched',
  inspect_dropper: 'Droppers Searched',
  inspect_hopper: 'Hoppers Searched',
  leave_game: 'Games Quit',
  open_barrel: 'Barrels Opened',
  open_chest: 'Chests Opened',
  open_enderchest: 'Ender Chests Opened',
  open_shulker_box: 'Shulker Boxes Opened',
  pig_one_cm: 'Distance by Pig',
  play_noteblock: 'Note Blocks Played',
  play_record: 'Music Discs Played',
  pot_flower: 'Plants Potted',
  raid_trigger: 'Raids Triggered',
  raid_win: 'Raids Won',
  sleep_in_bed: 'Times Slept in a Bed',
  sneak_time: 'Sneak Time',
  strider_one_cm: 'Distance by Strider',
  talked_to_villager: 'Talked to Villagers',
  target_hit: 'Targets Hit',
  time_since_death: 'Time Since Last Death',
  time_since_rest: 'Time Since Last Sleep',
  total_world_time: 'Time with World Open',
  traded_with_villager: 'Traded with Villagers',
  trigger_trapped_chest: 'Trapped Chests Triggered',
  tune_noteblock: 'Note Blocks Tuned',
  use_cauldron: 'Water Taken from Cauldron',
  walk_on_water_one_cm: 'Distance Walked on Water',
  walk_under_water_one_cm: 'Distance Walked under Water',
};

function getCustomStatLabel(key: string, t: ReturnType<typeof useTranslation>['t']): string {
  const i18nKey = CUSTOM_STAT_I18N_KEYS[key];
  if (i18nKey) return t(`playerProfile.stats.${i18nKey}`);
  return CUSTOM_STAT_LABELS[key] ?? formatMinecraftId(key.replace(/_one_cm$/, ''));
}

function topEntries(record: Record<string, number>, count: number): Array<{ name: string; value: number }> {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([name, value]) => ({ name, value }));
}

function GameStatsSection({
  stats,
  playerName,
  avatarUrl,
  serverName,
}: {
  stats: MinecraftStats;
  playerName: string;
  avatarUrl: string | null;
  serverName: string;
}) {
  const { t } = useTranslation();
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
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
  const hiddenInOtherList = new Set<string>([
    ...heroStats.map((s) => s.key),
    ...detailStats.map((s) => s.key),
    ...distanceStats.map((s) => s.key),
  ]);
  const otherCustomStats = Object.entries(stats.custom)
    .filter(([k, v]) => !hiddenInOtherList.has(k) && v > 0)
    .sort(([ka], [kb]) => getCustomStatLabel(ka, t).localeCompare(getCustomStatLabel(kb, t)));
  const itemRows = buildItemRows(stats);
  const mobRows = buildMobRows(stats);
  const topMined = topEntries(stats.mined, 6);
  const topCrafted = topEntries(stats.crafted, 6);
  const topKilled = topEntries(stats.killed, 6);
  const topKilledBy = topEntries(stats.killedBy, 5);
  const hasGeneral = heroStats.length > 0 || otherCustomStats.length > 0;
  const hasMobs = mobRows.length > 0;
  const hasItems = itemRows.length > 0;
  if (!hasGeneral && !hasMobs && !hasItems) return null;
  const handleExport = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        await document.fonts.ready;
      }
      // Fonts are bundled as same-origin @fontsource assets, so the CSSOM is
      // readable and html-to-image can collect and base64-inline every @font-face.
      let fontEmbedCSS: string | undefined;
      try {
        fontEmbedCSS = await getFontEmbedCSS(exportRef.current);
      } catch {
        fontEmbedCSS = undefined;
      }
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
        fontEmbedCSS,
      });
      const safeName = playerName.replace(/[^a-z0-9_-]/gi, '_');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName}-stats.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(t('playerProfile.stats.exportSuccess'));
    } catch {
      toast.error(t('playerProfile.stats.exportError'));
    } finally {
      setIsExporting(false);
    }
  };
  return (
    <FeatureCard.Stack>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title>{t('playerProfile.stats.title')}</FeatureCard.Title>
          </FeatureCard.Content>
          <FeatureCard.Actions>
            <Button variant={'secondary'} icon={Download} loading={isExporting} onClick={handleExport}>
              {t('playerProfile.stats.export')}
            </Button>
          </FeatureCard.Actions>
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
                {hasItems && (
                  <TabsTrigger value={'items'}>
                    <Pickaxe className={'size-3.5'} />
                    {t('playerProfile.stats.items')}
                  </TabsTrigger>
                )}
                {hasMobs && (
                  <TabsTrigger value={'mobs'}>
                    <Sword className={'size-3.5'} />
                    {t('playerProfile.stats.mobs')}
                  </TabsTrigger>
                )}
              </TabsList>
              {hasGeneral && (
                <TabsContent value={'general'} className={'space-y-4 pt-4'}>
                  {heroStats.length > 0 && (
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
                  )}
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
                  {otherCustomStats.length > 0 && (
                    <div>
                      <div className={'mb-2 flex items-center gap-1.5'}>
                        <span className={'text-[11px] font-semibold tracking-wider text-zinc-400 uppercase'}>
                          {t('playerProfile.stats.allGeneral')}
                        </span>
                      </div>
                      <div className={'grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3'}>
                        {otherCustomStats.map(([key, value]) => (
                          <div
                            key={key}
                            className={
                              'flex items-center justify-between border-b border-dashed border-zinc-200 py-1.5 dark:border-zinc-700'
                            }
                          >
                            <span className={'truncate pr-2 text-xs text-zinc-500'}>{getCustomStatLabel(key, t)}</span>
                            <span className={'font-jetbrains shrink-0 text-xs font-medium tabular-nums'}>
                              {formatCustomStat(key, value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              )}
              {hasItems && (
                <TabsContent value={'items'} className={'pt-4'}>
                  <ItemsTable rows={itemRows} />
                </TabsContent>
              )}
              {hasMobs && (
                <TabsContent value={'mobs'} className={'pt-4'}>
                  <MobsTable rows={mobRows} />
                </TabsContent>
              )}
            </Tabs>
          </div>
        </FeatureCard.Body>
      </FeatureCard>
      <div aria-hidden={true} style={{ position: 'fixed', top: 0, left: '-10000px', pointerEvents: 'none', zIndex: -1 }}>
        <div ref={exportRef}>
          <StatsExportCard
            {...{
              playerName,
              avatarUrl,
              serverName,
              stats,
              heroStats,
              detailStats,
              distanceStats,
              topMined,
              topCrafted,
              topKilled,
              topKilledBy,
            }}
          />
        </div>
      </div>
    </FeatureCard.Stack>
  );
}

type StatsExportCardProps = {
  playerName: string;
  avatarUrl: string | null;
  serverName: string;
  stats: MinecraftStats;
  heroStats: Array<{ key: string; label: string; format: (v: number) => string; icon: typeof Clock }>;
  detailStats: Array<{ key: string; label: string; format: (v: number) => string }>;
  distanceStats: Array<{ key: string; label: string }>;
  topMined: Array<{ name: string; value: number }>;
  topCrafted: Array<{ name: string; value: number }>;
  topKilled: Array<{ name: string; value: number }>;
  topKilledBy: Array<{ name: string; value: number }>;
};

function StatsExportCard({
  playerName,
  avatarUrl,
  serverName,
  stats,
  heroStats,
  detailStats,
  distanceStats,
  topMined,
  topCrafted,
  topKilled,
  topKilledBy,
}: StatsExportCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={'relative w-240 overflow-hidden p-3'}
      style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 30%, #7c3aed 55%, #db2777 85%, #f97316 100%)',
      }}
    >
      <div
        className={'pointer-events-none absolute -top-32 -left-32 size-112 rounded-full opacity-60 blur-3xl'}
        style={{ background: '#4338ca' }}
      />
      <div
        className={'pointer-events-none absolute -right-32 -bottom-32 size-128 rounded-full opacity-55 blur-3xl'}
        style={{ background: '#be185d' }}
      />
      <div
        className={'pointer-events-none absolute top-1/3 right-1/4 size-80 rounded-full opacity-35 blur-3xl'}
        style={{ background: '#f59e0b' }}
      />
      <div
        className={'relative overflow-hidden rounded-3xl border border-white/10 bg-white'}
        style={{ boxShadow: '0 50px 100px -20px rgba(0, 0, 0, 0.6), 0 20px 40px -10px rgba(0, 0, 0, 0.4)' }}
      >
        <StatsExportCard.Header {...{ playerName, avatarUrl, serverName }} />
        <div className={'space-y-8 p-8'}>
          {heroStats.length > 0 && <StatsExportCard.HeroStats {...{ heroStats, stats }} />}
          {detailStats.length > 0 && <StatsExportCard.DetailStats {...{ detailStats, stats }} />}
          {distanceStats.length > 0 && <StatsExportCard.DistanceStats {...{ distanceStats, stats }} />}
          {(topKilled.length > 0 || topKilledBy.length > 0) && (
            <div className={'grid grid-cols-2 gap-6'}>
              {topKilled.length > 0 && (
                <StatsExportCard.RankedList
                  icon={Sword}
                  title={t('playerProfile.stats.mobsKilled')}
                  entries={topKilled}
                  barColor={'#10b98133'}
                />
              )}
              {topKilledBy.length > 0 && (
                <StatsExportCard.RankedList
                  icon={Skull}
                  title={t('playerProfile.stats.killedBy')}
                  entries={topKilledBy}
                  barColor={'#ef444433'}
                />
              )}
            </div>
          )}
          {(topMined.length > 0 || topCrafted.length > 0) && (
            <div className={'grid grid-cols-2 gap-6'}>
              {topMined.length > 0 && (
                <StatsExportCard.RankedList
                  icon={Pickaxe}
                  title={t('playerProfile.stats.topMined')}
                  entries={topMined}
                  barColor={'#f59e0b33'}
                />
              )}
              {topCrafted.length > 0 && (
                <StatsExportCard.RankedList
                  icon={Hammer}
                  title={t('playerProfile.stats.topCrafted')}
                  entries={topCrafted}
                  barColor={'#3b82f633'}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

StatsExportCard.Header = function StatsExportCardHeader({
  playerName,
  avatarUrl,
  serverName,
}: {
  playerName: string;
  avatarUrl: string | null;
  serverName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={'flex items-center gap-5 border-b border-zinc-100 px-8 py-6'}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={playerName} className={'size-16 rounded-2xl border border-black/5'} />
      ) : (
        <div className={'flex size-16 items-center justify-center rounded-2xl bg-zinc-100'}>
          <User className={'size-8 text-zinc-400'} />
        </div>
      )}
      <div>
        <p className={'text-2xl font-semibold text-zinc-900'}>{playerName}</p>
        <p className={'mt-0.5 text-sm text-zinc-500'}>{t('playerProfile.stats.exportSubtitle', { server: serverName })}</p>
      </div>
    </div>
  );
};

StatsExportCard.HeroStats = function StatsExportCardHeroStats({
  heroStats,
  stats,
}: {
  heroStats: StatsExportCardProps['heroStats'];
  stats: MinecraftStats;
}) {
  return (
    <div className={'grid grid-cols-4 gap-3'}>
      {heroStats.map((s) => (
        <div key={s.key} className={'rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3'}>
          <div className={'flex items-center gap-1.5 text-xs text-zinc-500'}>
            <s.icon className={'size-3.5'} />
            {s.label}
          </div>
          <p className={'font-jetbrains mt-1 text-xl font-semibold text-zinc-900 tabular-nums'}>
            {s.format(stats.custom[s.key])}
          </p>
        </div>
      ))}
    </div>
  );
};

StatsExportCard.DetailStats = function StatsExportCardDetailStats({
  detailStats,
  stats,
}: {
  detailStats: StatsExportCardProps['detailStats'];
  stats: MinecraftStats;
}) {
  return (
    <div className={'grid grid-cols-3 gap-x-6'}>
      {detailStats.map((s) => (
        <div key={s.key} className={'flex items-center justify-between border-b border-dashed border-zinc-200 py-2'}>
          <span className={'text-xs text-zinc-500'}>{s.label}</span>
          <span className={'font-jetbrains text-sm font-medium text-zinc-800 tabular-nums'}>{s.format(stats.custom[s.key])}</span>
        </div>
      ))}
    </div>
  );
};

StatsExportCard.DistanceStats = function StatsExportCardDistanceStats({
  distanceStats,
  stats,
}: {
  distanceStats: StatsExportCardProps['distanceStats'];
  stats: MinecraftStats;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className={'mb-3 flex items-center gap-1.5'}>
        <Footprints className={'size-3.5 text-zinc-400'} />
        <span className={'text-[11px] font-semibold tracking-wider text-zinc-400 uppercase'}>
          {t('playerProfile.stats.distances')}
        </span>
      </div>
      <div className={'grid grid-cols-3 gap-x-6'}>
        {distanceStats.map((d) => (
          <div key={d.key} className={'flex items-center justify-between border-b border-dashed border-zinc-200 py-2'}>
            <span className={'text-xs text-zinc-500'}>{d.label}</span>
            <span className={'font-jetbrains text-sm font-medium text-zinc-800 tabular-nums'}>
              {formatDistance(stats.custom[d.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

StatsExportCard.RankedList = function StatsExportCardRankedList({
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
        <Icon className={'size-3.5 text-zinc-400'} />
        <span className={'text-[11px] font-semibold tracking-wider text-zinc-400 uppercase'}>{title}</span>
      </div>
      <div className={'space-y-1'}>
        {entries.map((entry) => {
          const pct = Math.max((entry.value / maxValue) * 100, 2);
          return (
            <div key={entry.name} className={'relative flex items-center gap-3 rounded-md px-2 py-1.5'}>
              <div className={'absolute inset-y-0 left-0 rounded-md'} style={{ width: `${pct}%`, background: barColor }} />
              <span className={'relative z-10 min-w-0 flex-1 truncate text-xs text-zinc-700'}>
                {formatMinecraftId(entry.name)}
              </span>
              <span className={'font-jetbrains relative z-10 shrink-0 text-xs font-medium text-zinc-900 tabular-nums'}>
                {entry.value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SESSION_PAGE_SIZE = 50;
const SESSION_MAX_RECORDS = 1000;

function SessionHistoryPanel({ serverId, playerName }: { serverId: string; playerName: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(SESSION_PAGE_SIZE);
  const { data } = usePlayerSessions(serverId, playerName, limit);
  const hasMore = data ? data.sessions.length < data.total && limit < SESSION_MAX_RECORDS : false;
  return (
    <div className={'shrink-0'}>
      <button
        type={'button'}
        onClick={() => setExpanded(!expanded)}
        className={
          'flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
        }
      >
        <History className={'size-3.5'} />
        {t('playerProfile.sessionHistory')}
        {data && data.total > 0 && <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>({data.total})</span>}
        <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && data && (
        <div
          className={
            'mt-2 max-h-64 overflow-y-auto rounded-xl border border-black/6 bg-zinc-50/50 dark:border-white/6 dark:bg-zinc-900/50'
          }
        >
          {data.sessions.length === 0 ? (
            <div className={'px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500'}>{t('playerProfile.noSessions')}</div>
          ) : (
            <>
              {data.sessions.map((session) => (
                <div
                  key={session.id}
                  className={
                    'flex items-center justify-between px-4 py-1.5 text-xs not-last:border-b not-last:border-black/4 dark:not-last:border-white/4'
                  }
                >
                  <div className={'flex items-center gap-2'}>
                    {session.leftAt ? (
                      <LogOut className={'size-3 text-red-400'} />
                    ) : (
                      <LogIn className={'size-3 text-green-600'} />
                    )}
                    <span className={'font-jetbrains tabular-nums'}>{new Date(session.joinedAt).toLocaleString()}</span>
                  </div>
                  <div className={'flex items-center gap-3 text-zinc-500 dark:text-zinc-400'}>
                    {session.durationMinutes !== null && (
                      <span className={'font-jetbrains tabular-nums'}>{formatDuration(session.durationMinutes * 60_000)}</span>
                    )}
                    {session.leftAt === null && <span className={'text-green-600'}>{t('players.online', { count: '' })}</span>}
                  </div>
                </div>
              ))}
              {hasMore && (
                <button
                  type={'button'}
                  onClick={() => setLimit((prev) => Math.min(prev + SESSION_PAGE_SIZE, SESSION_MAX_RECORDS))}
                  className={
                    'w-full border-t border-black/4 px-4 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:border-white/4 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
                  }
                >
                  {t('players.loadMore')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type ItemRow = {
  name: string;
  mined: number;
  broken: number;
  crafted: number;
  used: number;
  pickedUp: number;
  dropped: number;
};

type MobRow = {
  name: string;
  killed: number;
  killedBy: number;
};

function buildItemRows(stats: MinecraftStats): Array<ItemRow> {
  const names = new Set<string>();
  for (const record of [stats.mined, stats.broken, stats.crafted, stats.used, stats.pickedUp, stats.dropped]) {
    for (const key of Object.keys(record)) names.add(key);
  }
  return Array.from(names)
    .map((name) => ({
      name,
      mined: stats.mined[name] ?? 0,
      broken: stats.broken[name] ?? 0,
      crafted: stats.crafted[name] ?? 0,
      used: stats.used[name] ?? 0,
      pickedUp: stats.pickedUp[name] ?? 0,
      dropped: stats.dropped[name] ?? 0,
    }))
    .filter((r) => r.mined + r.broken + r.crafted + r.used + r.pickedUp + r.dropped > 0)
    .sort((a, b) => {
      const ta = a.mined + a.broken + a.crafted + a.used + a.pickedUp + a.dropped;
      const tb = b.mined + b.broken + b.crafted + b.used + b.pickedUp + b.dropped;
      return tb - ta;
    });
}

function buildMobRows(stats: MinecraftStats): Array<MobRow> {
  const names = new Set<string>([...Object.keys(stats.killed), ...Object.keys(stats.killedBy)]);
  return Array.from(names)
    .map((name) => ({ name, killed: stats.killed[name] ?? 0, killedBy: stats.killedBy[name] ?? 0 }))
    .filter((r) => r.killed + r.killedBy > 0)
    .sort((a, b) => b.killed + b.killedBy - (a.killed + a.killedBy));
}

function ItemsTable({ rows }: { rows: Array<ItemRow> }) {
  const { t } = useTranslation();
  return (
    <div
      className={
        'max-h-[560px] overflow-auto rounded-lg border border-black/6 bg-white dark:border-white/6 dark:bg-zinc-900/40'
      }
    >
      <table className={'w-full text-sm'}>
        <thead
          className={
            'sticky top-0 bg-white text-left text-[11px] tracking-wider text-zinc-500 uppercase dark:bg-zinc-900 dark:text-zinc-400'
          }
        >
          <tr className={'border-b border-black/6 dark:border-white/6'}>
            <th className={'px-3 py-2 font-medium'}>{t('playerProfile.stats.columns.item')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.mined')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.broken')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.crafted')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.used')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.pickedUp')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.dropped')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.name}
              className={'border-t border-black/4 hover:bg-zinc-50/60 dark:border-white/4 dark:hover:bg-zinc-800/40'}
            >
              <td className={'px-3 py-1.5'}>
                <div className={'flex items-center gap-2'}>
                  <MinecraftIcon id={row.name} />
                  <span className={'truncate text-xs text-zinc-700 dark:text-zinc-300'}>{formatMinecraftId(row.name)}</span>
                </div>
              </td>
              <CountCell value={row.mined} />
              <CountCell value={row.broken} />
              <CountCell value={row.crafted} />
              <CountCell value={row.used} />
              <CountCell value={row.pickedUp} />
              <CountCell value={row.dropped} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobsTable({ rows }: { rows: Array<MobRow> }) {
  const { t } = useTranslation();
  return (
    <div
      className={
        'max-h-[560px] overflow-auto rounded-lg border border-black/6 bg-white dark:border-white/6 dark:bg-zinc-900/40'
      }
    >
      <table className={'w-full text-sm'}>
        <thead
          className={
            'sticky top-0 bg-white text-left text-[11px] tracking-wider text-zinc-500 uppercase dark:bg-zinc-900 dark:text-zinc-400'
          }
        >
          <tr className={'border-b border-black/6 dark:border-white/6'}>
            <th className={'px-3 py-2 font-medium'}>{t('playerProfile.stats.columns.mob')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.killedByYou')}</th>
            <th className={'px-3 py-2 text-right font-medium'}>{t('playerProfile.stats.columns.killedByThem')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.name}
              className={'border-t border-black/4 hover:bg-zinc-50/60 dark:border-white/4 dark:hover:bg-zinc-800/40'}
            >
              <td className={'px-3 py-1.5'}>
                <span className={'truncate text-xs text-zinc-700 dark:text-zinc-300'}>{formatMinecraftId(row.name)}</span>
              </td>
              <CountCell value={row.killed} />
              <CountCell value={row.killedBy} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CountCell({ value }: { value: number }) {
  return (
    <td
      className={cn(
        'px-3 py-1.5 text-right',
        'font-jetbrains text-xs tabular-nums',
        value > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-600'
      )}
    >
      {value > 0 ? value.toLocaleString() : '-'}
    </td>
  );
}

