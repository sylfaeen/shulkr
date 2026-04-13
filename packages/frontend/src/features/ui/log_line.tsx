import { cn } from '@shulkr/frontend/lib/cn';

export function LogLine({
  lineNumber,
  time,
  level,
  message,
  className = 'text-xs',
}: {
  lineNumber?: number;
  time?: string;
  level?: string;
  message: string;
  className?: string;
}) {
  const levelColor =
    level === 'ERROR'
      ? 'text-red-700 dark:text-red-400'
      : level === 'WARN'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-zinc-800 dark:text-zinc-300';

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
      {time && <span className={'shrink-0 text-zinc-400 select-none dark:text-zinc-500'}>{time}</span>}
      {level && (
        <span
          className={cn(
            'hidden w-10 shrink-0 text-right font-semibold select-none sm:inline',
            level === 'ERROR'
              ? 'text-red-600 dark:text-red-400'
              : level === 'WARN'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-blue-600/80 dark:text-blue-400/60'
          )}
        >
          {level}
        </span>
      )}
      <span className={'min-w-0 pl-2 break-all whitespace-pre-wrap'}>{message}</span>
    </div>
  );
}
