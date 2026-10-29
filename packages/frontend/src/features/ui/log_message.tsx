import { Fragment, useMemo } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';
import { highlightPlayers } from '@shulkr/frontend/lib/highlight_players';
import { parseMinecraftFormatting } from '@shulkr/frontend/lib/minecraft_formatting';
import { splitUrls } from '@shulkr/frontend/lib/split_urls';

export function LogMessage({
  message,
  playerNames,
  serverId,
}: {
  message: string;
  playerNames?: Set<string>;
  serverId?: string;
}) {
  return useMemo(() => {
    const colors: Record<string, string> = {
      '0': 'text-zinc-950 dark:text-zinc-600',
      '1': 'text-blue-800 dark:text-blue-500',
      '2': 'text-green-800 dark:text-green-600',
      '3': 'text-cyan-800 dark:text-cyan-600',
      '4': 'text-red-800 dark:text-red-600',
      '5': 'text-purple-800 dark:text-purple-500',
      '6': 'text-amber-700 dark:text-amber-400',
      '7': 'text-zinc-500 dark:text-zinc-400',
      '8': 'text-zinc-700 dark:text-zinc-600',
      '9': 'text-blue-700 dark:text-blue-400',
      a: 'text-green-700 dark:text-green-400',
      b: 'text-cyan-700 dark:text-cyan-300',
      c: 'text-red-700 dark:text-red-400',
      d: 'text-fuchsia-700 dark:text-fuchsia-400',
      e: 'text-yellow-700 dark:text-yellow-300',
      f: 'text-zinc-950 dark:text-white',
    };

    const renderText = (text: string) =>
      playerNames && playerNames.size > 0 && serverId ? highlightPlayers(text, playerNames, serverId) : text;

    return parseMinecraftFormatting(message).map((segment, index) => (
      <span
        key={index}
        className={cn(
          segment.color && colors[segment.color],
          segment.bold && 'font-bold',
          segment.italic && 'italic',
          segment.underlined && 'underline',
          segment.strikethrough && 'line-through'
        )}
        style={segment.color?.startsWith('#') ? { color: segment.color } : undefined}
      >
        {splitUrls(segment.text).map((part, partIndex) =>
          part.url ? (
            <a
              key={partIndex}
              href={part.text}
              target={'_blank'}
              rel={'noopener noreferrer'}
              className={'underline underline-offset-2 hover:text-blue-400'}
            >
              {part.text}
            </a>
          ) : (
            <Fragment key={partIndex}>{renderText(part.text)}</Fragment>
          )
        )}
      </span>
    ));
  }, [message, playerNames, serverId]);
}
