import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Cpu, Info, RotateCcw } from 'lucide-react';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer, useUpdateServer } from '@shulkr/frontend/hooks/use_servers';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { useInstalledJava } from '@shulkr/frontend/hooks/use_java';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Textarea } from '@shulkr/frontend/features/ui/shadcn/textarea';
import { AIKAR_FLAGS_STRING, DEFAULT_JAVA_PORT } from '@shulkr/shared';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/shadcn/form';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerSettingsJvmPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsJvm')}` : t('nav.settingsJvm'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Cpu} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.settingsJvm')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/configuration'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('settings.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <div className={'space-y-4'}>
          <Alert variant={'warning'}>
            <Info className={'size-4'} />
            <AlertDescription>{t('settings.restartRequired')}</AlertDescription>
          </Alert>
          <FeatureCard.Stack>
            <JvmConfigSection serverId={server.id} />
          </FeatureCard.Stack>
        </div>
      </PageContent>
    </>
  );
}

const jvmConfigSchema = z.object({
  min_ram: z.string().regex(/^\d+[GMK]$/, 'Invalid format (e.g., 2G, 512M)'),
  max_ram: z.string().regex(/^\d+[GMK]$/, 'Invalid format (e.g., 4G, 1024M)'),
  jvm_flags: z.string(),
  java_port: z.coerce.number().int().min(1024).max(65535),
  auto_start: z.boolean(),
  auto_restart_on_crash: z.boolean(),
  java_mode: z.enum(['bundled', 'custom']),
  java_path: z.string(),
  custom_java_path: z.string(),
});

type JvmConfigFormValues = z.infer<typeof jvmConfigSchema>;

function JvmConfigSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canUpdate = can('server:jvm:update');

  const { data: server } = useServer(serverId);
  const { data: javaVersions } = useInstalledJava();
  const updateServer = useUpdateServer();

  const form = useForm<JvmConfigFormValues>({
    resolver: zodResolver(jvmConfigSchema),
    defaultValues: {
      min_ram: '1G',
      max_ram: '2G',
      jvm_flags: '',
      java_port: DEFAULT_JAVA_PORT,
      auto_start: false,
      auto_restart_on_crash: false,
      java_mode: 'bundled',
      java_path: '',
      custom_java_path: '',
    },
  });

  const initializedRef = useRef(false);
  const defaultValuesRef = useRef<JvmConfigFormValues | null>(null);

  useEffect(() => {
    if (!server || !javaVersions || initializedRef.current) return;
    initializedRef.current = true;

    let resolvedJavaMode: 'bundled' | 'custom' = 'bundled';
    let resolvedJavaPath = '';
    let resolvedCustomJavaPath = '';

    if (server.java_path) {
      const isBundled = javaVersions.some((j) => j.path === server.java_path);
      if (isBundled) {
        resolvedJavaMode = 'bundled';
        resolvedJavaPath = server.java_path;
      } else {
        resolvedJavaMode = 'custom';
        resolvedCustomJavaPath = server.java_path;
      }
    } else {
      const defaultJava = javaVersions.find((j) => j.isDefault) ?? javaVersions[0];
      if (defaultJava) {
        resolvedJavaMode = 'bundled';
        resolvedJavaPath = defaultJava.path;
      }
    }

    const values: JvmConfigFormValues = {
      min_ram: server.min_ram || '1G',
      max_ram: server.max_ram || '2G',
      jvm_flags: server.jvm_flags || AIKAR_FLAGS_STRING,
      java_port: server.java_port || DEFAULT_JAVA_PORT,
      auto_start: server.auto_start || false,
      auto_restart_on_crash: server.auto_restart_on_crash || false,
      java_mode: resolvedJavaMode,
      java_path: resolvedJavaPath,
      custom_java_path: resolvedCustomJavaPath,
    };

    defaultValuesRef.current = values;
    form.reset(values);
  }, [server, javaVersions, form]);

  const jvmFlags = form.watch('jvm_flags');
  const javaMode = form.watch('java_mode');
  const javaPath = form.watch('java_path');
  const hasAikarFlags = jvmFlags.includes('-XX:+UseG1GC') && jvmFlags.includes('-XX:G1NewSizePercent');

  const handleToggleAikarFlags = (checked: boolean) => {
    if (checked) {
      const currentFlags = jvmFlags.trim();
      form.setValue('jvm_flags', currentFlags ? `${AIKAR_FLAGS_STRING} ${currentFlags}` : AIKAR_FLAGS_STRING);
    } else {
      const aikarParts = AIKAR_FLAGS_STRING.split(' ');
      const remainingFlags = jvmFlags
        .split(' ')
        .filter((f) => f && !aikarParts.includes(f))
        .join(' ');
      form.setValue('jvm_flags', remainingFlags);
    }
  };

  const [gateOpen, setGateOpen] = useState(false);
  const [pendingData, setPendingData] = useState<JvmConfigFormValues | null>(null);

  const handleDiscard = useCallback(() => {
    if (defaultValuesRef.current) {
      form.reset(defaultValuesRef.current);
    }
  }, [form]);

  const handleFormSubmit = useCallback((data: JvmConfigFormValues) => {
    setPendingData(data);
    setGateOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!pendingData) return;
    await updateServer.mutateAsync({
      id: serverId,
      min_ram: pendingData.min_ram,
      max_ram: pendingData.max_ram,
      jvm_flags: pendingData.jvm_flags.trim(),
      java_port: pendingData.java_port,
      auto_start: pendingData.auto_start,
      auto_restart_on_crash: pendingData.auto_restart_on_crash,
      java_path: pendingData.java_mode === 'custom' ? pendingData.custom_java_path || null : pendingData.java_path || null,
    });
    defaultValuesRef.current = pendingData;
    form.reset(pendingData);
    setPendingData(null);
  }, [serverId, updateServer, form, pendingData]);

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('settings.jvmConfig')}</FeatureCard.Title>
          <FeatureCard.Description>{t('settings.jvmConfigDescription')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)}>
          <FeatureCard.Body className={'space-y-6'}>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel>{t('settings.memorySettings')}</FeatureCard.RowLabel>
                <div className={'grid gap-4 sm:grid-cols-2'}>
                  <FormField
                    control={form.control}
                    name={'min_ram'}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.minRam')}</FormLabel>
                        <FormControl>
                          <Input type={'text'} placeholder={'2G'} readOnly={!canUpdate} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={'max_ram'}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.maxRam')}</FormLabel>
                        <FormControl>
                          <Input type={'text'} placeholder={'4G'} readOnly={!canUpdate} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className={'rounded-lg border border-black/6 bg-zinc-50/50 p-4 dark:border-white/6 dark:bg-zinc-800/50'}>
                  <FormField
                    control={form.control}
                    name={'jvm_flags'}
                    render={() => (
                      <FormItem className={'flex cursor-pointer items-center gap-3'}>
                        <FormControl>
                          <Switch checked={hasAikarFlags} onCheckedChange={handleToggleAikarFlags} disabled={!canUpdate} />
                        </FormControl>
                        <div>
                          <FormLabel light>{t('settings.useAikarFlags')}</FormLabel>
                          <FormDescription>{t('settings.aikarDescription')}</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={'jvm_flags'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('settings.customJvmFlags')}
                        {hasAikarFlags && ` ${t('settings.inAdditionToAikar')}`}
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder={'-Dflag=value'} rows={8} readOnly={!canUpdate} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </FeatureCard.Stack>
            </FeatureCard.Row>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel>{t('settings.javaPort')}</FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'java_port'}
                  render={({ field }) => (
                    <FormItem className={'w-full'}>
                      <FormControl>
                        <Input
                          type={'number'}
                          min={1024}
                          max={65535}
                          className={'w-full sm:w-48'}
                          readOnly={!canUpdate}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t('settings.defaultPort')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FeatureCard.Stack>
            </FeatureCard.Row>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel>{t('settings.javaVersion')}</FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={javaMode === 'bundled' ? 'java_path' : 'java_mode'}
                  render={() => (
                    <FormItem className={'w-full'}>
                      <FormControl>
                        <Select
                          disabled={!canUpdate}
                          value={javaMode === 'bundled' ? javaPath : 'custom'}
                          onValueChange={(val) => {
                            if (val === 'custom') {
                              form.setValue('java_mode', 'custom');
                              form.setValue('java_path', '');
                            } else {
                              form.setValue('java_mode', 'bundled');
                              form.setValue('java_path', val);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {javaVersions?.map((java) => (
                              <SelectItem key={java.name} value={java.path}>
                                {java.name} (Java {java.version}){java.isDefault ? ` - ${t('appSettings.java.default')}` : ''}
                              </SelectItem>
                            ))}
                            <SelectItem value={'custom'}>{t('settings.customJavaPath')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {javaMode === 'custom' && (
                  <FormField
                    control={form.control}
                    name={'custom_java_path'}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type={'text'}
                            placeholder={t('settings.customJavaPathPlaceholder')}
                            readOnly={!canUpdate}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>{t('settings.customJavaPathHint')}</FormDescription>
                      </FormItem>
                    )}
                  />
                )}
              </FeatureCard.Stack>
            </FeatureCard.Row>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel>{t('settings.autoStartSettings')}</FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'auto_start'}
                  render={({ field }) => (
                    <FormItem className={'flex cursor-pointer items-center gap-3'}>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canUpdate} />
                      </FormControl>
                      <div>
                        <FormLabel light>{t('settings.enableAutoStart')}</FormLabel>
                        <FormDescription>{t('settings.autoStartDescription')}</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </FeatureCard.Stack>
            </FeatureCard.Row>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel>{t('settings.crashRecoverySettings')}</FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'auto_restart_on_crash'}
                  render={({ field }) => (
                    <FormItem className={'flex cursor-pointer items-center gap-3'}>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canUpdate} />
                      </FormControl>
                      <div>
                        <FormLabel light>{t('settings.enableCrashRecovery')}</FormLabel>
                        <FormDescription>{t('settings.crashRecoveryDescription')}</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </FeatureCard.Stack>
            </FeatureCard.Row>
          </FeatureCard.Body>
          <FeatureCard.Footer>
            {canUpdate && (
              <div className={'flex items-center justify-end gap-2'}>
                <Button
                  variant={'ghost'}
                  size={'sm'}
                  onClick={handleDiscard}
                  disabled={updateServer.isPending || !form.formState.isDirty}
                  loading={updateServer.isPending}
                >
                  <RotateCcw className={'size-4'} />
                  {t('settings.cancel')}
                </Button>
                <Button type={'submit'} size={'sm'} disabled={updateServer.isPending} loading={updateServer.isPending}>
                  {updateServer.isPending ? t('files.saving') : t('settings.saveConfig')}
                </Button>
              </div>
            )}
          </FeatureCard.Footer>
        </form>
      </Form>
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t('settings.saveConfig')}
        description={t('settings.jvmConfig')}
        onConfirm={handleSave}
      />
    </FeatureCard>
  );
}
