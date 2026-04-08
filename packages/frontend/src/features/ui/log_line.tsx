import { cn } from '@shulkr/frontend/lib/cn';

type LogLineProps = {
  time?: string;
  level?: string;
  message: string;
  className?: string;
};

export function LogLine({ time, level, message, className }: LogLineProps) {
  const levelColor = level === 'ERROR' ? 'text-red-400' : level === 'WARN' ? 'text-amber-400' : 'text-zinc-200';

  return (
    <div
      className={cn('font-jetbrains border-b border-white/2 py-0.5 text-sm leading-relaxed last:border-0', levelColor, className)}
    >
      {time && (
        <span className={'mr-2 text-zinc-500 select-none'}>
          [{time}
          {level ? ` ${level}` : ''}]
        </span>
      )}
      <span className={'break-all whitespace-pre-wrap'}>{message}</span>
    </div>
  );
}
