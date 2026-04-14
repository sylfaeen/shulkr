import { useState, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Activity, Cpu, HardDrive, Play, RotateCcw, CircleStop, Users } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer, useStartServer, useStopServer, useRestartServer } from '@shulkr/frontend/hooks/use_servers';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { useConsoleWebSocket } from '@shulkr/frontend/hooks/use_console';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { Badge, badgeVariants } from '@shulkr/frontend/features/ui/shadcn/badge';
import { ServerConsole } from '@shulkr/frontend/pages/app/servers/features/server_console';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { formatUptime } from '@shulkr/frontend/lib/uptime';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import type { ServerMetrics } from '@shulkr/shared';
import type { VariantProps } from 'class-variance-authority';

type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'deleting';

export function ServerConsolePage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading, error } = useServer(id || '');
  const {
    messages,
    isConnected,
    isConnecting,
    error: wsError,
    sendCommand,
    metrics,
    players,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useConsoleWebSocket(server?.id || null);

  const playerNameSet = useMemo(() => new Set(players), [players]);

  usePageTitle(server?.name ? `${server.name} • ${t('nav.console')}` : t('nav.console'));

  if (isLoading) return <ServerPageSkeleton />;
  if (error || !server) return <PageError message={t('errors.generic')} />;

  const isRunning = server.status === 'running';

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Activity} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.Title>{server.name}</ServerPageHeader.Title>
              <ServerPageHeader.PageName>{t('nav.dashboard')}</ServerPageHeader.PageName>
              <StatusBadge status={server.status} />
            </ServerPageHeader.Heading>
            <p className={'font-jetbrains mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400'}>{server.path}</p>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
        <ServerPageHeader.Actions>
          <ServerActions status={server.status} serverId={server.id} />
        </ServerPageHeader.Actions>
      </ServerPageHeader>
      <PageContent fill>
        <div className={'flex min-h-0 flex-1 flex-col space-y-4'}>
          <ServerConsole
            error={wsError}
            className={'min-h-0 flex-1'}
            serverId={server.id}
            playerNames={playerNameSet}
            {...{ messages, isConnected, isConnecting, sendCommand, hasMore, isLoadingMore, loadMore }}
          />
          <MetricsBar
            uptime={metrics?.uptime ?? server.uptime}
            playerCount={players.length}
            {...{ isRunning, metrics, players }}
          />

        </div>
      </PageContent>
    </>
  );
}

const STATUS_BADGE: Record<
  ServerStatus,
  { variant: VariantProps<typeof badgeVariants>['variant']; labelKey: string; className?: string }
> = {
  stopped: { variant: 'destructive', labelKey: 'servers.status.offline' },
  starting: { variant: 'success', labelKey: 'servers.status.starting', className: 'animate-pulse' },
  running: { variant: 'success', labelKey: 'servers.status.online' },
  stopping: { variant: 'warning', labelKey: 'servers.status.stopping', className: 'animate-pulse' },
  deleting: { variant: 'secondary', labelKey: 'servers.status.deleting', className: 'animate-pulse' },
};

function StatusBadge({ status }: { status: ServerStatus }) {
  const { t } = useTranslation();
  const config = STATUS_BADGE[status];

  return (
    <Badge variant={config.variant} className={cn('font-semibold tracking-wider uppercase', config.className)}>
      {t(config.labelKey)}
    </Badge>
  );
}

function ServerActions({ serverId, status }: { serverId: string; status: ServerStatus }) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canStart = can('server:power:start');
  const canStop = can('server:power:stop');
  const canRestart = can('server:power:restart');

  const [isActionPending, setIsActionPending] = useState(false);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const restartServer = useRestartServer();

  const isStopped = status === 'stopped';
  const isRunning = status === 'running';
  const isTransitioning = status === 'starting' || status === 'stopping';

  const handleAction = async (action: typeof startServer) => {
    setIsActionPending(true);
    try {
      await action.mutateAsync(serverId);
    } catch {
    } finally {
      setIsActionPending(false);
    }
  };

  if (isTransitioning) {
    return (
      <Badge variant={'outline'} className={'animate-pulse rounded-lg px-4 py-2'}>
        {status === 'starting' ? t('servers.status.starting') : t('servers.status.stopping')}...
      </Badge>
    );
  }

  return (
    <div className={'flex gap-2'}>
      {isStopped && canStart && (
        <Button
          variant={'success'}
          onClick={() => handleAction(startServer)}
          disabled={isActionPending}
          loading={startServer.isPending}
          className={'min-h-11 min-w-11'}
        >
          <Play className={'size-4'} />
          <span className={'hidden min-[960px]:inline'}>{t('servers.actions.start')}</span>
        </Button>
      )}
      {isRunning && (
        <>
          {canStop && (
            <Button
              variant={'destructive'}
              onClick={() => handleAction(stopServer)}
              disabled={isActionPending}
              loading={stopServer.isPending}
              className={'min-h-11 min-w-11'}
            >
              <CircleStop className={'size-4'} />
              <span className={'hidden min-[960px]:inline'}>{t('servers.actions.stop')}</span>
            </Button>
          )}
          {canRestart && (
            <Button
              className={'min-h-11 min-w-11 bg-amber-500 text-white hover:bg-amber-600'}
              onClick={() => handleAction(restartServer)}
              disabled={isActionPending}
              loading={restartServer.isPending}
            >
              <RotateCcw className={'size-4'} />
              <span className={'hidden min-[960px]:inline'}>{t('servers.actions.restart')}</span>
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function MetricsBar({
  isRunning,
  metrics,
  playerCount,
  players,
  uptime,
}: {
  isRunning: boolean;
  metrics: ServerMetrics | null;
  playerCount: number;
  players: Array<string>;
  uptime: number | null | undefined;
}) {
  const { t } = useTranslation();

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  const cpuTooltip = metrics
    ? `${t('dashboard.cpuCores')}: ${metrics.cpu_cores}\n${t('dashboard.cpuRaw')}: ${metrics.cpu_raw.toFixed(1)}% / ${metrics.cpu_cores * 100}%\n${t('dashboard.cpuNormalized')}: ${metrics.cpu.toFixed(1)}% / 100%`
    : undefined;

  return (
    <div
      className={
        'grid shrink-0 grid-cols-1 gap-x-4 gap-y-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6'
      }
    >
      <MetricItem
        icon={Cpu}
        iconColor={'text-zinc-600 dark:text-zinc-400'}
        label={t('dashboard.cpu')}
        value={isRunning && metrics ? `${metrics.cpu.toFixed(1)}%` : '-'}
        tooltip={cpuTooltip}
      />
      <div className={'hidden h-4 w-px bg-black/6 sm:block'} />
      <MetricItem
        icon={HardDrive}
        iconColor={'text-zinc-600 dark:text-zinc-400'}
        label={t('dashboard.memory')}
        value={isRunning && metrics ? formatMemory(metrics.memory) : '-'}
        detail={isRunning && metrics ? `${metrics.memory_percent.toFixed(0)}%` : undefined}
      />
      <div className={'hidden h-4 w-px bg-black/6 sm:block'} />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger>
            <MetricItem
              icon={Users}
              iconColor={'text-zinc-600 dark:text-zinc-400'}
              label={t('dashboard.players')}
              value={isRunning ? `${playerCount}` : '-'}
            />
          </TooltipTrigger>
          <TooltipContent>{isRunning && players.length > 0 ? players.join(', ') : t('players.noPlayers')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {isRunning && metrics?.tps !== undefined && (
        <>
          <div className={'hidden h-4 w-px bg-black/6 sm:block'} />
          <MetricItem
            icon={Activity}
            iconColor={
              metrics.tps >= 19
                ? 'text-green-600 dark:text-green-400'
                : metrics.tps >= 15
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
            }
            label={'TPS'}
            value={`${metrics.tps.toFixed(1)}`}
            detail={metrics.mspt !== undefined ? `${metrics.mspt.toFixed(1)}ms` : undefined}
          />
        </>
      )}
      <div className={'hidden h-4 w-px bg-black/6 sm:block'} />
      <MetricItem
        icon={Activity}
        iconColor={'text-zinc-600 dark:text-zinc-400'}
        label={t('dashboard.uptime')}
        value={isRunning && uptime ? formatUptime(uptime) : '-'}
      />
    </div>
  );
}

function MetricItem({
  icon: Icon,
  iconColor,
  label,
  value,
  detail,
  tooltip,
}: {
  icon: typeof Cpu;
  iconColor: string;
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
}) {
  const content = (
    <div className={'flex items-center gap-2'}>
      <Icon className={cn('size-3.5', iconColor)} strokeWidth={2} />
      <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{label}</span>
      <span className={'text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-100'}>{value}</span>
      {detail && <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{detail}</span>}
    </div>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={'cursor-default'}>{content}</div>
          </TooltipTrigger>
          <TooltipContent className={'max-w-xs rounded-lg px-3 py-2 text-sm whitespace-pre-line'}>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
