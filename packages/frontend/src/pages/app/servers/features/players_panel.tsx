import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { PlayerLink } from '@shulkr/frontend/features/ui/player_link';
import { ChevronDown, Users, Clock, Globe } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { PlayerActions } from '@shulkr/frontend/pages/app/servers/features/player_actions';
import type { PlayerInfo } from '@shulkr/shared';
import { formatDurationSince } from '@shulkr/frontend/lib/duration';

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
  if (!isRunning || playerDetails.length === 0) return null;
  return (
    <div className={'shrink-0'}>
      <button
        type={'button'}
        onClick={() => setExpanded(!expanded)}
        className={
          'flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
        }
      >
        <Users className={'size-3.5'} />
        {t('players.online', { count: playerDetails.length })}
        <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className={'mt-2 rounded-xl border border-black/6 bg-zinc-50/50 dark:border-white/6 dark:bg-zinc-900/50'}>
          {playerDetails.map((player) => (
            <div
              key={player.name}
              className={
                'flex items-center justify-between px-4 py-2 text-sm not-last:border-b not-last:border-black/4 dark:not-last:border-white/4'
              }
            >
              <PlayerLink name={player.name} {...{ serverId }} />
              <div className={'flex items-center gap-6 text-xs text-zinc-500 dark:text-zinc-400'}>
                {player.ip && (
                  <span className={'flex items-center gap-1'}>
                    <Globe className={'size-3'} />
                    {player.ip}
                  </span>
                )}
                <span className={'flex items-center gap-1'}>
                  <Clock className={'size-3'} />
                  {formatDurationSince(player.joinedAt)}
                </span>
                <PlayerActions playerName={player.name} {...{ sendCommand }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
