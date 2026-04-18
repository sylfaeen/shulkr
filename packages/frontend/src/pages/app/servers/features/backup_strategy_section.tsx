import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Cloud, HardDrive, Info, Link2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { useCloudDestinations, useBackupStrategy, useUpdateBackupStrategy } from '@shulkr/frontend/hooks/use_cloud_destinations';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import type { BackupStrategyInput } from '@shulkr/frontend/hooks/use_cloud_destinations';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';

export function BackupStrategySection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canEdit = can('server:backups:create');

  const { data: strategy } = useBackupStrategy(serverId);
  const { data: destinations } = useCloudDestinations();
  const updateStrategy = useUpdateBackupStrategy(serverId);

  const [local, setLocal] = useState<BackupStrategyInput>({ mode: 'local-only' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (strategy) {
      setLocal(strategy);
      setDirty(false);
    }
  }, [strategy]);

  const enabledDestinations = destinations?.filter((d) => d.enabled) ?? [];
  const noCloudConfigured = enabledDestinations.length === 0;

  const update = (patch: Partial<BackupStrategyInput>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!local.mode) return;
    if ((local.mode === 'cloud-only' || local.mode === 'hybrid') && !local.cloudDestinationId) return;
    await updateStrategy.mutateAsync(local).catch(() => {});
    setDirty(false);
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('backupStrategy.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('backupStrategy.subtitle')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body className={'space-y-4 p-2'}>
        <div className={'grid grid-cols-1 gap-2 md:grid-cols-3'}>
          <ModeCard
            icon={HardDrive}
            mode={'local-only'}
            active={local.mode === 'local-only'}
            accentClass={'border-zinc-400/40 bg-zinc-500/5'}
            title={t('backupStrategy.modes.localOnly.title')}
            description={t('backupStrategy.modes.localOnly.description')}
            disabled={!canEdit}
            onClick={() => update({ mode: 'local-only', cloudDestinationId: undefined })}
          />
          <ModeCard
            icon={Cloud}
            mode={'cloud-only'}
            active={local.mode === 'cloud-only'}
            accentClass={'border-sky-500/40 bg-sky-500/5'}
            title={t('backupStrategy.modes.cloudOnly.title')}
            description={t('backupStrategy.modes.cloudOnly.description')}
            disabled={!canEdit || noCloudConfigured}
            onClick={() => update({ mode: 'cloud-only' })}
          />
          <ModeCard
            icon={Link2}
            mode={'hybrid'}
            active={local.mode === 'hybrid'}
            accentClass={'border-amber-500/40 bg-amber-500/5'}
            title={t('backupStrategy.modes.hybrid.title')}
            description={t('backupStrategy.modes.hybrid.description')}
            disabled={!canEdit || noCloudConfigured}
            onClick={() => update({ mode: 'hybrid' })}
          />
        </div>
        {(local.mode === 'cloud-only' || local.mode === 'hybrid') && (
          <div className={'space-y-3 rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-900/30'}>
            <div>
              <label className={'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'}>
                {t('backupStrategy.cloudDestination')}
              </label>
              <Select
                value={local.cloudDestinationId ?? ''}
                onValueChange={(v) => update({ cloudDestinationId: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className={'h-9'}>
                  <SelectValue placeholder={t('backupStrategy.selectDestination')} />
                </SelectTrigger>
                <SelectContent>
                  {enabledDestinations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.bucket})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {local.mode === 'hybrid' && (
              <div>
                <label className={'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'}>
                  {t('backupStrategy.localRetentionCount')}
                </label>
                <Input
                  type={'number'}
                  min={1}
                  className={'w-32'}
                  value={local.localRetentionCount ?? 5}
                  onChange={(e) => update({ localRetentionCount: Number(e.target.value) })}
                  disabled={!canEdit}
                />
                <p className={'mt-1 text-[11px] text-zinc-500 dark:text-zinc-500'}>{t('backupStrategy.localRetentionHint')}</p>
              </div>
            )}
            <div>
              <label className={'mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400'}>
                {t('backupStrategy.cloudRetentionDays')}
              </label>
              <Input
                type={'number'}
                min={1}
                className={'w-32'}
                value={local.cloudRetentionDays ?? 30}
                onChange={(e) => update({ cloudRetentionDays: Number(e.target.value) })}
                disabled={!canEdit}
              />
              <p className={'mt-1 text-[11px] text-zinc-500 dark:text-zinc-500'}>{t('backupStrategy.cloudRetentionHint')}</p>
            </div>
          </div>
        )}
        {canEdit && dirty && (
          <div className={'flex justify-end'}>
            <Button onClick={handleSave} loading={updateStrategy.isPending} disabled={updateStrategy.isPending}>
              {t('common.save')}
            </Button>
          </div>
        )}
      </FeatureCard.Body>
      <FeatureCard.Footer alert>
        {noCloudConfigured && local.mode === 'local-only' && (
          <Alert variant={'warning'}>
            <Info className={'size-4'} />
            <AlertDescription className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
              <span>{t('backupStrategy.hints.noDestinations')}</span>
              <Link
                to={'/app/settings/cloud-destinations'}
                className={'inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline'}
              >
                {t('backupStrategy.hints.configureLink')}
                <ArrowRight className={'size-3'} />
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </FeatureCard.Footer>
    </FeatureCard>
  );
}

function ModeCard({
  icon: Icon,
  active,
  accentClass,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof HardDrive;
  mode: string;
  active: boolean;
  accentClass: string;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type={'button'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border p-3 text-left transition-all',
        disabled && 'cursor-not-allowed opacity-50',
        active
          ? accentClass
          : 'border-black/6 bg-zinc-50/50 text-zinc-600 hover:border-black/12 hover:bg-zinc-50 dark:border-white/6 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:border-white/12 dark:hover:bg-zinc-800'
      )}
    >
      <Icon
        className={cn(
          'mb-2 size-4 transition-colors',
          active ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400'
        )}
        strokeWidth={2}
      />
      <div
        className={cn('text-sm font-medium', active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400')}
      >
        {title}
      </div>
      <div className={'mt-0.5 text-xs text-zinc-600 dark:text-zinc-400'}>{description}</div>
    </button>
  );
}
