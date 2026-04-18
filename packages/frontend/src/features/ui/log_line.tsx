import { useMemo } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';
import { highlightPlayers } from '@shulkr/frontend/lib/highlight_players';

export function LogLine({
  lineNumber,
  date,
  level,
  message,
  className = 'text-xs',
  playerNames,
  serverId,
}: {
  lineNumber?: number;
  date?: string;
  level?: string;
  message: string;
  className?: string;
  playerNames?: Set<string>;
  serverId?: string;
}) {
  const levelColor =
    level === 'ERROR'
      ? 'text-red-700 dark:text-red-400'
      : level === 'WARN'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-zinc-800 dark:text-zinc-300';

  const rendered = useMemo(() => {
    if (!playerNames || playerNames.size === 0 || !serverId) return message;
    return highlightPlayers(message, playerNames, serverId);
  }, [message, playerNames, serverId]);

  return (
    <div
      className={cn(
        'font-jetbrains group flex rounded-sm px-1 leading-relaxed transition-colors hover:bg-black/4 dark:hover:bg-white/3',
        levelColor,
        className
      )}
    >
      {lineNumber !== undefined && (
        <span className={'shrink-0 pr-2 text-right text-zinc-300 tabular-nums select-none dark:text-zinc-600'}>{lineNumber}</span>
      )}
      {date && <span className={'shrink-0 pr-2 text-zinc-400 select-none dark:text-zinc-500'}>{date}</span>}
      <span className={'min-w-0 break-all whitespace-pre-wrap'}>{rendered}</span>
    </div>
  );
}
