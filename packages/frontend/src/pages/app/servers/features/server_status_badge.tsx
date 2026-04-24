import { useTranslation } from 'react-i18next';
import { cn } from '@shulkr/frontend/lib/cn';
import { Box } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';

type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'deleting';

const statusConfig: Record<ServerStatus, { labelKey: string; className: string; iconClass: string }> = {
  stopped: {
    labelKey: 'servers.status.offline',
    className: 'bg-red-500 text-white',
    iconClass: 'text-white',
  },
  starting: {
    labelKey: 'servers.status.starting',
    className: 'bg-green-500 text-white animate-pulse',
    iconClass: 'text-white animate-pulse',
  },
  running: {
    labelKey: 'servers.status.online',
    className: 'bg-green-600 text-white',
    iconClass: 'text-white',
  },
  stopping: {
    labelKey: 'servers.status.stopping',
    className: 'bg-red-500 text-white animate-pulse',
    iconClass: 'text-white animate-pulse',
  },
  deleting: {
    labelKey: 'servers.status.deleting',
    className: 'bg-zinc-400 text-white animate-pulse',
    iconClass: 'text-white animate-pulse',
  },
};

export function ServerStatusIcon({ status }: { status: ServerStatus }) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger>
          <div className={cn('flex size-8 items-center justify-center rounded transition-colors', config.className)}>
            <Box className={cn('size-4', config.iconClass)} strokeWidth={2} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t(config.labelKey)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
