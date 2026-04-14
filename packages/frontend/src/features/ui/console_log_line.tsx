import { cn } from '@shulkr/frontend/lib/cn';

export function ConsoleLogLine({
  date,
  level,
  message,
  className,
}: {
  date?: string;
  level?: string;
  message: string;
  className?: string;
}) {
  const levelColor = level === 'ERROR' ? 'text-red-400' : level === 'WARN' ? 'text-amber-400' : 'text-zinc-200';

  return (
    <div className={cn('font-jetbrains py-0.5 text-xs leading-relaxed sm:text-[13px]', levelColor, className)}>
      {date && <span className={'mr-2 text-zinc-500 select-none'}>{date}</span>}
      <span className={'break-all whitespace-pre-wrap'}>{message}</span>
    </div>
  );
}
