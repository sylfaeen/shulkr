import { type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightPlayers(message: string, playerNames: Set<string>, serverId: string): ReactNode {
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
        to={`/app/servers/${serverId}/players/${encodeURIComponent(name)}`}
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
