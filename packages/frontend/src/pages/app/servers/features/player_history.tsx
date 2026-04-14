import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, History, LogIn, LogOut } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { usePlayerHistory } from '@shulkr/frontend/hooks/use_player_history';
import { formatDuration } from '@shulkr/frontend/lib/duration';

export function PlayerHistoryPanel({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { data } = usePlayerHistory(serverId, 30);

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
        {t('players.history')}
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
            <div className={'px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500'}>{t('players.noPlayers')}</div>
          ) : (
            data.sessions.map((session) => (
              <div
                key={session.id}
                className={
                  'flex items-center justify-between px-4 py-1.5 text-xs not-last:border-b not-last:border-black/4 dark:not-last:border-white/4'
                }
              >
                <div className={'flex items-center gap-2'}>
                  {session.leftAt ? <LogOut className={'size-3 text-red-400'} /> : <LogIn className={'size-3 text-green-600'} />}
                  <span className={'font-medium text-zinc-900 dark:text-zinc-100'}>{session.playerName}</span>
                </div>
                <div className={'flex items-center gap-3 text-zinc-500 dark:text-zinc-400'}>
                  <span className={'font-jetbrains tabular-nums'}>{new Date(session.joinedAt).toLocaleString()}</span>
                  {session.durationMs !== null && (
                    <span className={'font-jetbrains tabular-nums'}>{formatDuration(session.durationMs)}</span>
                  )}
                  {session.leftAt === null && <span className={'text-green-600'}>{t('players.online', { count: '' })}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
