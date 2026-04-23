import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Cloud, HardDrive, Info, Link2, Settings } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@shulkr/frontend/features/ui/shadcn/form';
import { useCloudDestinations, useBackupStrategy, useUpdateBackupStrategy } from '@shulkr/frontend/hooks/use_cloud_destinations';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';

const backupStrategySchema = z
  .object({
    mode: z.enum(['local-only', 'cloud-only', 'hybrid']),
    cloudDestinationId: z.string().optional(),
    cloudRetentionDays: z.coerce.number().min(1).optional(),
  })
  .refine((data) => data.mode === 'local-only' || Boolean(data.cloudDestinationId), {
    path: ['cloudDestinationId'],
    message: 'required',
  });

type BackupStrategyFormValues = z.infer<typeof backupStrategySchema>;

export function BackupStrategySection({ serverId, onOpenSettings }: { serverId: string; onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canEdit = can('server:backups:create');
  const { data: strategy } = useBackupStrategy(serverId);
  const { data: destinations } = useCloudDestinations();
  const { data: server } = useServer(serverId);
  const updateStrategy = useUpdateBackupStrategy(serverId);
  const form = useForm<BackupStrategyFormValues>({
    resolver: zodResolver(backupStrategySchema),
    defaultValues: { mode: 'local-only' },
  });
  useEffect(() => {
    if (strategy) form.reset(strategy);
  }, [strategy, form]);
  const mode = form.watch('mode');
  const dirty = form.formState.isDirty;
  const enabledDestinations = destinations?.filter((d) => d.enabled) ?? [];
  const noCloudConfigured = enabledDestinations.length === 0;
  const handleSave = async (values: BackupStrategyFormValues) => {
    await updateStrategy.mutateAsync(values).catch(() => {});
    form.reset(values);
  };
  const selectMode = (next: BackupStrategyFormValues['mode']) => {
    form.setValue('mode', next, { shouldDirty: true });
    if (next === 'local-only') {
      form.setValue('cloudDestinationId', undefined, { shouldDirty: true });
    }
  };
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('backupStrategy.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('backupStrategy.subtitle')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)}>
          <FeatureCard.Body className={'space-y-4 p-2'}>
            <div className={'grid grid-cols-1 gap-2 md:grid-cols-3'}>
              <ModeCard
                icon={HardDrive}
                active={mode === 'local-only'}
                accentClass={'border-zinc-400/40 bg-zinc-500/5'}
                title={t('backupStrategy.modes.localOnly.title')}
                description={t('backupStrategy.modes.localOnly.description')}
                disabled={!canEdit}
                onClick={() => selectMode('local-only')}
              />
              <ModeCard
                icon={Cloud}
                active={mode === 'cloud-only'}
                accentClass={'border-sky-500/40 bg-sky-500/5'}
                title={t('backupStrategy.modes.cloudOnly.title')}
                description={t('backupStrategy.modes.cloudOnly.description')}
                disabled={!canEdit || noCloudConfigured}
                onClick={() => selectMode('cloud-only')}
              />
              <ModeCard
                icon={Link2}
                active={mode === 'hybrid'}
                accentClass={'border-amber-500/40 bg-amber-500/5'}
                title={t('backupStrategy.modes.hybrid.title')}
                description={t('backupStrategy.modes.hybrid.description')}
                disabled={!canEdit || noCloudConfigured}
                onClick={() => selectMode('hybrid')}
              />
            </div>
            {(mode === 'cloud-only' || mode === 'hybrid') && (
              <div
                className={'space-y-3 rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-900/30'}
              >
                <FormField
                  control={form.control}
                  name={'cloudDestinationId'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={'text-xs font-medium'}>{t('backupStrategy.cloudDestination')}</FormLabel>
                      <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger className={'h-9'}>
                            <SelectValue placeholder={t('backupStrategy.selectDestination')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {enabledDestinations.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name} ({d.bucket})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mode === 'hybrid' && (
                  <div
                    className={
                      'flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/6 bg-white/60 p-3 dark:border-white/6 dark:bg-zinc-800/40'
                    }
                  >
                    <div className={'flex flex-col'}>
                      <span className={'text-xs font-medium text-zinc-700 dark:text-zinc-300'}>
                        {t('backupStrategy.localRetentionCount')}
                      </span>
                      <span className={'text-[11px] text-zinc-600 dark:text-zinc-400'}>
                        {t('backupStrategy.localRetentionHint', {
                          count: server?.max_backups ?? 0,
                        })}
                      </span>
                    </div>
                    <Button type={'button'} variant={'secondary'} size={'sm'} icon={Settings} onClick={onOpenSettings}>
                      {t('backups.settings.button')}
                    </Button>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name={'cloudRetentionDays'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={'text-xs font-medium'}>{t('backupStrategy.cloudRetentionDays')}</FormLabel>
                      <FormControl>
                        <Input
                          type={'number'}
                          min={1}
                          className={'w-32'}
                          disabled={!canEdit}
                          placeholder={'30'}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription className={'text-[11px]'}>{t('backupStrategy.cloudRetentionHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            {canEdit && dirty && (
              <div className={'flex justify-end'}>
                <Button type={'submit'} loading={updateStrategy.isPending} disabled={updateStrategy.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            )}
          </FeatureCard.Body>
        </form>
      </Form>
      <FeatureCard.Footer alert>
        {noCloudConfigured && mode === 'local-only' && (
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
