import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { ChevronDown, Users, Clock, Globe, Activity, MapPin, ShieldCheck } from 'lucide-react';
import { PlayerLink } from '@shulkr/frontend/features/ui/player_link';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { PlayerActions } from '@shulkr/frontend/pages/app/servers/features/player_actions';
import type { PlayerInfo } from '@shulkr/shared';
import { formatDurationSince } from '@shulkr/frontend/lib/duration';
import heartFull from '@shulkr/frontend/assets/minecraft-icons/heart-full.webp';
import heartHalf from '@shulkr/frontend/assets/minecraft-icons/heart-half.webp';
import heartEmpty from '@shulkr/frontend/assets/minecraft-icons/heart-empty.webp';
import hungerFull from '@shulkr/frontend/assets/minecraft-icons/hunger-full.webp';
import hungerHalf from '@shulkr/frontend/assets/minecraft-icons/hunger-half.webp';
import hungerEmpty from '@shulkr/frontend/assets/minecraft-icons/hunger-empty.webp';

export function PlayersPanel({
  playerDetails,
  isRunning,
  sendCommand,
  defaultExpanded = false,
}: {
  playerDetails: Array<PlayerInfo>;
  isRunning: boolean;
  sendCommand: (command: string) => boolean;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation();
  const { id: serverId } = useParams({ strict: false });
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!isRunning || playerDetails.length === 0 || !serverId) return null;

  return (
    <div className={'shrink-0'}>
      <Button
        variant={'ghost'}
        onClick={() => setExpanded(!expanded)}
        className={
          'group h-auto gap-2 rounded-lg px-2 py-1.5 text-sm font-normal text-zinc-600 transition-colors hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100'
        }
      >
        <span className={'relative flex size-2 items-center justify-center'} aria-hidden={true}>
          <span className={'absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60'} />
          <span className={'relative inline-flex size-1.5 rounded-full bg-emerald-500'} />
        </span>
        <Users className={'size-3.5'} />
        <span className={'tabular-nums'}>{t('players.online', { count: playerDetails.length })}</span>
        <ChevronDown className={cn('size-3 text-zinc-400 transition-transform', expanded && 'rotate-180')} />
      </Button>
      {expanded && (
        <div
          className={
            'relative mt-2 overflow-hidden rounded-xl border border-black/6 bg-gradient-to-b from-zinc-50/70 to-zinc-50/30 dark:border-white/6 dark:from-zinc-900/60 dark:to-zinc-950/60'
          }
        >
          <span
            aria-hidden={true}
            className={
              'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent'
            }
          />
          {playerDetails.map((player) => (
            <PlayerRow key={player.uuid ?? player.name} {...{ player, serverId, sendCommand }} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  serverId,
  sendCommand,
}: {
  player: PlayerInfo;
  serverId: string;
  sendCommand: (command: string) => boolean;
}) {
  const { t } = useTranslation();

  const hasLocation = player.world !== null && player.x !== null && player.y !== null && player.z !== null;

  const hasTelemetry = player.health !== null || player.food !== null || player.ping !== null || hasLocation;

  const isCritical = player.health !== null && player.health <= 4;

  return (
    <div
      className={
        'flex items-center gap-3 px-4 py-3.5 not-last:border-b not-last:border-black/4 dark:not-last:border-white/4'
      }
    >
      <PlayerHead uuid={player.uuid} name={player.name} />
      <div className={'flex min-w-0 flex-1 flex-col'}>
        <div className={'flex items-center justify-between gap-3'}>
          <div className={'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'}>
            <PlayerLink name={player.name} {...{ serverId }} />
            {player.op === true && (
              <span
                className={
                  'inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400'
                }
              >
                <ShieldCheck className={'size-2.5'} />
                {t('players.op')}
              </span>
            )}
            {player.ip !== null && (
              <span className={'inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-500'}>
                <Globe className={'size-3'} />
                <span className={'font-mono tabular-nums'}>{player.ip}</span>
              </span>
            )}
          </div>
          <PlayerActions playerName={player.name} {...{ sendCommand }} />
        </div>
        <div className={'flex flex-wrap items-center gap-x-4 gap-y-2'}>
          {player.health !== null && (
            <IconRow
              value={player.health}
              full={heartFull}
              half={heartHalf}
              empty={heartEmpty}
              ariaLabel={t('players.health')}
              critical={isCritical}
            />
          )}
          {player.food !== null && (
            <IconRow
              value={player.food}
              full={hungerFull}
              half={hungerHalf}
              empty={hungerEmpty}
              ariaLabel={t('players.food')}
              critical={false}
            />
          )}
          {player.ping !== null && <PingPill ping={player.ping} />}
          <span className={'inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400'}>
            <Clock className={'size-3'} />
            <span className={'tabular-nums'}>{formatDurationSince(player.joinedAt)}</span>
          </span>
          {hasLocation && <LocationTag world={player.world!} x={player.x!} y={player.y!} z={player.z!} />}
          {!hasTelemetry && (
            <span className={'text-[11px] text-zinc-400 italic dark:text-zinc-500'}>{t('players.telemetryUnavailable')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerHead({ uuid, name }: { uuid: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (uuid !== null && !failed) {
    return (
      <img
        src={`/api/players/${uuid}/avatar?size=64`}
        alt={''}
        width={28}
        height={28}
        loading={'lazy'}
        onError={() => setFailed(true)}
        className={
          'size-7 shrink-0 rounded-sm bg-zinc-200 ring-1 ring-black/5 [image-rendering:pixelated] dark:bg-zinc-800 dark:ring-white/5'
        }
      />
    );
  }

  const hue = hashHue(name);

  return (
    <span
      aria-hidden={true}
      style={{ backgroundColor: `hsl(${hue} 45% 42%)` }}
      className={
        'inline-flex size-7 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-semibold text-white ring-1 ring-black/10 dark:ring-white/10'
      }
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function IconRow({
  value,
  full,
  half,
  empty,
  ariaLabel,
  critical,
}: {
  value: number;
  full: string;
  half: string;
  empty: string;
  ariaLabel: string;
  critical: boolean;
}) {
  return (
    <div
      role={'progressbar'}
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemax={20}
      aria-valuemin={0}
      className={cn('inline-flex items-center gap-1.5', critical && 'animate-pulse')}
    >
      <div className={'flex items-center'}>
        {Array.from({ length: 10 }, (_, i) => {
          const remaining = value - i * 2;
          const src = remaining >= 2 ? full : remaining >= 1 ? half : empty;

          return <img key={i} src={src} alt={''} width={9} height={9} className={'size-3 [image-rendering:pixelated]'} />;
        })}
      </div>
      <span className={'min-w-[2ch] font-mono text-[10px] text-zinc-500 tabular-nums dark:text-zinc-400'}>{value}</span>
    </div>
  );
}

function PingPill({ ping }: { ping: number }) {
  const tone =
    ping <= 60
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : ping <= 150
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', tone)}>
      <Activity className={'size-2.5'} />
      <span className={'font-mono tabular-nums'}>{ping}</span>
      <span className={'opacity-70'}>{'ms'}</span>
    </span>
  );
}

function LocationTag({ world, x, y, z }: { world: string; x: number; y: number; z: number }) {
  return (
    <span className={'inline-flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400'}>
      <MapPin className={'size-3'} />
      <span className={'inline-flex items-center gap-1'}>
        <span className={cn('inline-block size-1.5 rounded-full', getWorldDotClass(world))} aria-hidden={true} />
        <span className={'font-medium text-zinc-700 dark:text-zinc-300'}>{formatWorldLabel(world)}</span>
      </span>
      <span className={'font-mono text-zinc-500 tabular-nums dark:text-zinc-500'}>
        {Math.round(x)} {Math.round(y)} {Math.round(z)}
      </span>
    </span>
  );
}

function getWorldDotClass(world: string): string {
  const lower = world.toLowerCase();
  if (lower.includes('nether')) return 'bg-red-500';
  if (lower.includes('end')) return 'bg-violet-500';
  if (lower.includes('overworld') || lower === 'world') return 'bg-emerald-500';

  return 'bg-zinc-400';
}

function formatWorldLabel(world: string): string {
  if (world === 'world' || world.toLowerCase() === 'minecraft:overworld') return 'Overworld';

  const cleaned = world
    .replace(/^minecraft:/, '')
    .replace(/^world_/, '')
    .replace(/_/g, ' ');

  if (cleaned.length === 0) return world;

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function hashHue(name: string): number {
  let h = 0;

  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }

  return Math.abs(h) % 360;
}
