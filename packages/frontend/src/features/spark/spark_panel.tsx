import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ExternalLink, Flame, Loader2 } from 'lucide-react';
import { useSparkStatus, useSparkHealth, useStartProfiler, useStopProfiler } from '@shulkr/frontend/hooks/use_spark';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';

export function SparkPanel({ serverId, isRunning }: { serverId: string; isRunning: boolean }) {
  const { t } = useTranslation();
  const { data: sparkStatus } = useSparkStatus(serverId);
  const { data: health } = useSparkHealth(serverId, !!sparkStatus?.installed && isRunning);
  const startProfiler = useStartProfiler(serverId);
  const stopProfiler = useStopProfiler(serverId);

  const [profiling, setProfiling] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  if (!sparkStatus?.installed) return null;

  const handleStart = async () => {
    setProfiling(true);
    setResultUrl(null);
    await startProfiler.mutateAsync();
  };

  const handleStop = async () => {
    const result = await stopProfiler.mutateAsync();
    setProfiling(false);
    if (result.url) setResultUrl(result.url);
  };

  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'flex items-center justify-between'}>
        <div className={'flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
          <Flame className={'size-4'} />
          {t('spark.title')}
        </div>
        <div className={'flex items-center gap-2'}>
          {health?.tps !== undefined && (
            <Badge variant={health.tps >= 19 ? 'default' : health.tps >= 15 ? 'secondary' : 'destructive'}>
              TPS {health.tps}
            </Badge>
          )}
          {health?.mspt !== undefined && (
            <Badge variant={health.mspt < 50 ? 'default' : health.mspt < 100 ? 'secondary' : 'destructive'}>
              MSPT {health.mspt}ms
            </Badge>
          )}
        </div>
      </div>
      <div className={'mt-3 flex items-center gap-2'}>
        {profiling ? (
          <Button size={'sm'} variant={'secondary'} onClick={handleStop} disabled={stopProfiler.isPending}>
            {stopProfiler.isPending ? <Loader2 className={'size-3.5 animate-spin'} /> : <Activity className={'size-3.5'} />}
            {t('spark.stopProfiler')}
          </Button>
        ) : (
          <Button size={'sm'} onClick={handleStart} disabled={!isRunning || startProfiler.isPending}>
            {startProfiler.isPending ? <Loader2 className={'size-3.5 animate-spin'} /> : <Flame className={'size-3.5'} />}
            {t('spark.startProfiler')}
          </Button>
        )}
        {resultUrl && (
          <a href={resultUrl} target={'_blank'} rel={'noopener noreferrer'}>
            <Button size={'sm'} variant={'outline'}>
              <ExternalLink className={'size-3.5'} />
              {t('spark.openReport')}
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
