import { useMemo, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@shulkr/frontend/lib/cn';

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

function highlightPlayers(message: string, playerNames: Set<string>, serverId: string): ReactNode {
  const sortedNames = [...playerNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${sortedNames.map(escapeRegex).join('|')})\\b`, 'g');

  const parts: Array<ReactNode> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index));
    }
    const name = match[1];
    parts.push(
      <Link
        key={`${match.index}-${name}`}
        to={`/app/servers/${serverId}/players/${name}`}
        className={'underline decoration-dotted underline-offset-2 hover:text-blue-400'}
      >
        {name}
      </Link>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : message;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
