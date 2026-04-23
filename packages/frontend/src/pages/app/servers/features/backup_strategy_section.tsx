import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, ChevronDown, Cloud, HardDrive, Info, Link2, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Form, FormField, FormItem, FormControl, FormDescription, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
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
type BackupMode = BackupStrategyFormValues['mode'];

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
  const modeNeedsCloud = mode === 'cloud-only' || mode === 'hybrid';
  const [expanded, setExpanded] = useState(false);
  const showCloudFields = modeNeedsCloud && expanded;
  const handleSave = async (values: BackupStrategyFormValues) => {
    await updateStrategy.mutateAsync(values).catch(() => {});
    form.reset(values);
  };
  const selectMode = (next: BackupMode) => {
    if (next === 'local-only') {
      form.setValue('mode', 'local-only', { shouldDirty: true });
      form.setValue('cloudDestinationId', undefined, { shouldDirty: true });
      setExpanded(false);
      return;
    }
    if (next !== mode) {
      form.setValue('mode', next, { shouldDirty: true });
    }
    setExpanded(true);
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
          <FeatureCard.Body className={'space-y-0'}>
            <FeatureCard.Row layout={'column'} className={'gap-3 py-4'}>
              <FeatureCard.RowLabel>{t('backupStrategy.title')}</FeatureCard.RowLabel>
              <div className={'grid w-full grid-cols-1 gap-2 md:grid-cols-3'}>
                <ModeTile
                  icon={HardDrive}
                  active={mode === 'local-only'}
                  title={t('backupStrategy.modes.localOnly.title')}
                  description={t('backupStrategy.modes.localOnly.description')}
                  disabled={!canEdit}
                  onClick={() => selectMode('local-only')}
                />
                <ModeTile
                  icon={Cloud}
                  active={mode === 'cloud-only'}
                  title={t('backupStrategy.modes.cloudOnly.title')}
                  description={t('backupStrategy.modes.cloudOnly.description')}
                  disabled={!canEdit || noCloudConfigured}
                  onClick={() => selectMode('cloud-only')}
                />
                <ModeTile
                  icon={Link2}
                  active={mode === 'hybrid'}
                  title={t('backupStrategy.modes.hybrid.title')}
                  description={t('backupStrategy.modes.hybrid.description')}
                  disabled={!canEdit || noCloudConfigured}
                  onClick={() => selectMode('hybrid')}
                />
              </div>
              {modeNeedsCloud && (
                <button
                  type={'button'}
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  className={cn(
                    'group flex w-full items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors',
                    'border-black/12 bg-zinc-50/60 text-zinc-700 hover:border-black/25 hover:bg-zinc-50',
                    'dark:border-white/12 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:border-white/25 dark:hover:bg-zinc-800/70'
                  )}
                >
                  <span className={'flex items-center gap-2'}>
                    <Settings className={'size-3.5 text-zinc-500 dark:text-zinc-400'} strokeWidth={2} />
                    <span className={'font-medium'}>{t('backupStrategy.cloudSettings')}</span>
                    <span className={'text-xs text-zinc-500 dark:text-zinc-400'}>
                      {expanded ? t('backupStrategy.cloudSettingsHide') : t('backupStrategy.cloudSettingsShow')}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-zinc-500 transition-transform duration-200 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200',
                      expanded && 'rotate-180'
                    )}
                    strokeWidth={2}
                  />
                </button>
              )}
            </FeatureCard.Row>
            {showCloudFields && (
              <FeatureCard.Row layout={'column'} className={'gap-3 py-4'}>
                <FeatureCard.RowLabel description={t('backupStrategy.selectDestination')}>
                  {t('backupStrategy.cloudDestination')}
                </FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'cloudDestinationId'}
                  render={({ field }) => (
                    <FormItem className={'w-full'}>
                      <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger className={'w-full sm:w-80'}>
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
              </FeatureCard.Row>
            )}
            {showCloudFields && mode === 'hybrid' && (
              <FeatureCard.Row className={'items-center gap-3 py-4'}>
                <FeatureCard.RowLabel description={t('backupStrategy.localRetentionHint', { count: server?.max_backups ?? 0 })}>
                  {t('backupStrategy.localRetentionCount')}
                </FeatureCard.RowLabel>
                <FeatureCard.RowControl>
                  <Button type={'button'} variant={'secondary'} size={'sm'} icon={Settings} onClick={onOpenSettings}>
                    {t('backups.settings.button')}
                  </Button>
                </FeatureCard.RowControl>
              </FeatureCard.Row>
            )}
            {showCloudFields && (
              <FeatureCard.Row layout={'column'} className={'gap-3 py-4'}>
                <FeatureCard.RowLabel description={t('backupStrategy.cloudRetentionHint')}>
                  {t('backupStrategy.cloudRetentionDays')}
                </FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'cloudRetentionDays'}
                  render={({ field }) => (
                    <FormItem className={'w-full'}>
                      <FormControl>
                        <Input
                          type={'number'}
                          min={1}
                          className={'w-full sm:w-40'}
                          disabled={!canEdit}
                          placeholder={'30'}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription className={'sr-only'}>{t('backupStrategy.cloudRetentionHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FeatureCard.Row>
            )}
          </FeatureCard.Body>
          {noCloudConfigured && mode === 'local-only' && (
            <FeatureCard.Footer alert>
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
            </FeatureCard.Footer>
          )}
          {canEdit && dirty && (
            <FeatureCard.Footer>
              <div className={'flex items-center justify-end gap-2'}>
                <Button
                  type={'button'}
                  variant={'ghost'}
                  size={'sm'}
                  onClick={() => strategy && form.reset(strategy)}
                  disabled={updateStrategy.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type={'submit'} size={'sm'} loading={updateStrategy.isPending} disabled={updateStrategy.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </FeatureCard.Footer>
          )}
        </form>
      </Form>
    </FeatureCard>
  );
}

function ModeTile({
  icon: Icon,
  active,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  active: boolean;
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
      aria-pressed={active}
      className={cn(
        'relative flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
        disabled && 'cursor-not-allowed opacity-50',
        active
          ? 'border-zinc-800/70 bg-zinc-100 dark:border-zinc-200/60 dark:bg-zinc-800'
          : 'border-black/6 bg-zinc-50/50 hover:border-black/12 hover:bg-zinc-50 dark:border-white/6 dark:bg-zinc-800/50 dark:hover:border-white/12 dark:hover:bg-zinc-800/80'
      )}
    >
      <div className={'flex items-center justify-between'}>
        <Icon
          className={cn('size-4', active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400')}
          strokeWidth={2}
        />
        {active && (
          <span
            className={
              'flex size-4 items-center justify-center rounded-full bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
            }
          >
            <Check className={'size-2.5'} strokeWidth={3} />
          </span>
        )}
      </div>
      <div
        className={cn('text-sm font-medium', active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300')}
      >
        {title}
      </div>
      <div className={'text-xs text-zinc-600 dark:text-zinc-400'}>{description}</div>
    </button>
  );
}
