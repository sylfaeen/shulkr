import { useMemo } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';
import { highlightPlayers } from '@shulkr/frontend/lib/highlight_players';

export function ConsoleLogLine({
  date,
  level,
  message,
  className,
  playerNames,
  serverId,
}: {
  date?: string;
  level?: string;
  message: string;
  className?: string;
  playerNames?: Set<string>;
  serverId?: string;
}) {
  const levelColor = level === 'ERROR' ? 'text-red-400' : level === 'WARN' ? 'text-amber-400' : 'text-zinc-200';
  const rendered = useMemo(() => {
    if (!playerNames || playerNames.size === 0 || !serverId) return message;
    return highlightPlayers(message, playerNames, serverId);
  }, [message, playerNames, serverId]);
  return (
    <div className={cn('font-jetbrains py-0.5 text-xs leading-relaxed sm:text-sm', levelColor, className)}>
      {date && <span className={'mr-2 text-zinc-500 select-none'}>{date}</span>}
      <span className={'break-all whitespace-pre-wrap'}>{rendered}</span>
    </div>
  );
}
