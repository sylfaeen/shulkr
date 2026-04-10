import { cn } from '@shulkr/frontend/lib/cn';

export function LogLine({ time, level, message, className }: { time?: string; level?: string; message: string; className?: string }) {
  const levelColor = level === 'ERROR' ? 'text-red-400' : level === 'WARN' ? 'text-amber-400' : 'text-zinc-200';

  return (
    <div
      className={cn(
        'font-jetbrains border-b border-white/2 py-px text-xs leading-relaxed last:border-0 sm:py-0.5 sm:text-sm',
        levelColor,
        className
      )}
    >
      {time && (
        <span className={'mr-2 hidden text-zinc-400 select-none sm:inline'}>
          [{time}
          {level ? ` ${level}` : ''}]
        </span>
      )}
      <span className={'break-all whitespace-pre-wrap'}>{message}</span>
    </div>
  );
}
