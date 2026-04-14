import { cn } from '@shulkr/frontend/lib/cn';

export function ConsoleLogLine({
  time,
  level,
  message,
  className,
}: {
  time?: string;
  level?: string;
  message: string;
  className?: string;
}) {
  const levelColor = level === 'ERROR' ? 'text-red-400' : level === 'WARN' ? 'text-amber-400' : 'text-zinc-200';

  return (
    <div className={cn('font-jetbrains py-0.5 text-xs leading-relaxed sm:text-[13px]', levelColor, className)}>
      {time && <span className={'mr-2 text-zinc-500 select-none'}>{time}</span>}
      <span className={'break-all whitespace-pre-wrap'}>{message}</span>
    </div>
  );
}
