import { useState, useRef, useCallback, useEffect, useMemo, type ChangeEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Check, Download, Info, LoaderCircle, Package, RotateCcw, Trash2, Upload } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer, useUpdateServer } from '@shulkr/frontend/hooks/use_servers';
import {
  usePaperVersions,
  usePaperBuilds,
  useServerJars,
  useDownloadJar,
  useSetActiveJar,
  useDeleteJar,
  useUploadJar,
  formatJarSize,
  type PaperMCProject,
} from '@shulkr/frontend/hooks/use_jars';
import { useInstalledJava } from '@shulkr/frontend/hooks/use_java';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { Textarea } from '@shulkr/frontend/features/ui/shadcn/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { ApiError } from '@shulkr/frontend/lib/api';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
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
import { AIKAR_FLAGS_STRING, DEFAULT_JAVA_PORT, computeAikarFlags, parseRamToMb } from '@shulkr/shared';

export function ServerSettingsJarsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsJars')}` : t('nav.settingsJars'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('errors.generic')} />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Package} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.settingsJars')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/configuration'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('settings.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        {server?.status === 'running' && (
          <Alert variant={'warning'} className={'mb-4'}>
            <AlertTriangle className={'size-4'} />
            <AlertDescription>{t('servers.serverRunningWarning')}</AlertDescription>
          </Alert>
        )}
        <FeatureCard.Stack>
          <JarListSection serverId={server.id} />
          <PaperMCSection serverId={server.id} />
          <JvmConfigSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function JarListSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canDownload = can('server:jars:download');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: server } = useServer(serverId);
  const { data: jarsData, isLoading: jarsLoading } = useServerJars(serverId);
  const setActiveJar = useSetActiveJar(serverId);
  const deleteJar = useDeleteJar(serverId);
  const uploadJar = useUploadJar(serverId);

  const jars = jarsData?.jars;
  const activeJarFile = server?.jar_file;

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    const jarFiles = Array.from(files).filter((f) => f.name.endsWith('.jar'));
    if (jarFiles.length === 0) {
      setUploadError(t('settings.jarUpload.invalidFile'));
      return;
    }
    for (const file of jarFiles) {
      try {
        await uploadJar.mutateAsync({ file });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : t('settings.jarUpload.error'));
      }
    }
    e.target.value = '';
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title count={jars && jars.length > 0 && jars.length}>{t('settings.availableJars')}</FeatureCard.Title>
          <FeatureCard.Description>{t('settings.availableJarsDescription')}</FeatureCard.Description>
        </FeatureCard.Content>
        <FeatureCard.Actions>
          <div className={'flex items-center gap-2'}>
            {activeJarFile && (
              <div className={'hidden items-center gap-2 md:flex'}>
                <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('settings.currentJar')}:</span>
                <Badge variant={'secondary'} className={'font-jetbrains'}>
                  {activeJarFile}
                </Badge>
              </div>
            )}
            {canDownload && (
              <>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploadJar.isPending}
                  disabled={uploadJar.isPending}
                >
                  <Upload className={'size-4'} />
                  {t('settings.jarUpload.upload')}
                </Button>
                <input
                  ref={fileInputRef}
                  type={'file'}
                  accept={'.jar'}
                  multiple
                  onChange={handleFileSelect}
                  className={'hidden'}
                />
              </>
            )}
          </div>
        </FeatureCard.Actions>
      </FeatureCard.Header>
      {uploadError && (
        <div className={'flex items-center gap-2 px-5 pb-2 text-sm text-red-600'}>
          <AlertTriangle className={'size-3.5 shrink-0'} />
          {uploadError}
        </div>
      )}
      {jarsLoading ? (
        <div className={'py-8 text-center'}>
          <LoaderCircle className={'mx-auto size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
        </div>
      ) : !jars || jars.length === 0 ? (
        <div className={'bg-default shadow-xs-with-border relative overflow-hidden rounded-lg py-12'}>
          <div className={'absolute inset-0 bg-linear-to-b from-zinc-600/2 to-transparent'} />
          <div className={'relative flex flex-col items-center'}>
            <div className={'mb-3 flex size-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800'}>
              <Package className={'size-5 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
            </div>
            <p className={'mt-2 font-medium text-zinc-600 dark:text-zinc-400'}>{t('settings.noJarsFound')}</p>
          </div>
        </div>
      ) : (
        <FeatureCard.Body>
          {jars.map((jar) => (
            <JarRow key={jar.name} {...{ jar, setActiveJar, deleteJar }} />
          ))}
        </FeatureCard.Body>
      )}
    </FeatureCard>
  );
}

function PaperMCSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canDownload = can('server:jars:download');

  const [selectedProject, setSelectedProject] = useState<PaperMCProject>('paper');
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data: versionsData, isLoading: versionsLoading } = usePaperVersions(selectedProject);
  const { data: buildsData, isLoading: buildsLoading } = usePaperBuilds(selectedProject, selectedVersion);
  const versions = versionsData?.versions;
  const builds = buildsData?.builds;
  const downloadJar = useDownloadJar(serverId);

  if (!canDownload) return null;

  const handleProjectChange = (value: string) => {
    setSelectedProject(value as PaperMCProject);
    setSelectedVersion(null);
    setSelectedBuild(null);
  };

  const handleDownload = async () => {
    if (!selectedVersion) return;
    if (!canDownload) return null;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadJar.mutateAsync({
        project: selectedProject,
        version: selectedVersion,
        build: selectedBuild || undefined,
      });
      setSelectedVersion(null);
      setSelectedBuild(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setDownloadError(err.message);
      } else {
        setDownloadError(t('settings.downloadError'));
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const PAPERMC_PROJECTS: Array<{ value: PaperMCProject; label: string }> = [
    { value: 'paper', label: 'Paper' },
    { value: 'folia', label: 'Folia' },
    { value: 'velocity', label: 'Velocity' },
    { value: 'waterfall', label: 'Waterfall' },
  ];

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('settings.addJarPaperMC')}</FeatureCard.Title>
          <FeatureCard.Description>{t('settings.addJarPaperMCDescription')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        <div className={'rounded-xl border border-black/6 bg-zinc-50/50 p-4 dark:border-white/6 dark:bg-zinc-800/50'}>
          <div className={'grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4'}>
            <div>
              <Label>{t('settings.papermc.software')}</Label>
              <Select value={selectedProject} onValueChange={handleProjectChange} disabled={isDownloading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPERMC_PROJECTS.map((project) => (
                    <SelectItem key={project.value} value={project.value}>
                      {project.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('settings.papermc.version')}</Label>
              <Select
                key={`version-${selectedProject}`}
                value={selectedVersion || undefined}
                onValueChange={(value) => {
                  setSelectedVersion(value || null);
                  setSelectedBuild(null);
                }}
                disabled={versionsLoading || isDownloading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.papermc.selectVersion')} />
                </SelectTrigger>
                <SelectContent>
                  {versions?.map((version) => (
                    <SelectItem key={version} value={version}>
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('settings.buildOptional')}</Label>
              <Select
                key={`build-${selectedProject}-${selectedVersion}`}
                value={selectedBuild?.toString() || undefined}
                onValueChange={(value) => setSelectedBuild(value ? parseInt(value) : null)}
                disabled={!selectedVersion || buildsLoading || isDownloading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.latestBuild')} />
                </SelectTrigger>
                <SelectContent>
                  {builds?.map((build) => (
                    <SelectItem key={build} value={build.toString()}>
                      Build #{build}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleDownload} disabled={!selectedVersion || isDownloading} loading={isDownloading} size={'sm'}>
              <Download className={'size-4'} />
              {isDownloading ? t('settings.papermc.downloading') : t('settings.papermc.download')}
            </Button>
          </div>
          {downloadError && (
            <div className={'mt-3 flex items-center gap-2 text-sm text-red-600'}>
              <AlertTriangle className={'size-3.5 shrink-0'} />
              {downloadError}
            </div>
          )}
        </div>
      </FeatureCard.Body>
    </FeatureCard>
  );
}

function JvmConfigSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canUpdate = can('server:jvm:update');

  const { data: server } = useServer(serverId);
  const { data: javaVersions } = useInstalledJava();
  const updateServer = useUpdateServer();

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
  const maxRam = form.watch('max_ram');
  const javaMode = form.watch('java_mode');
  const javaPath = form.watch('java_path');
  const hasAikarFlags = jvmFlags.includes('-XX:+UseG1GC') && jvmFlags.includes('-XX:G1NewSizePercent');

  const aikarComputed = useMemo(() => {
    const ramMb = parseRamToMb(maxRam) || 2048;
    return computeAikarFlags({ ramMb });
  }, [maxRam]);

  const stripAikarFlags = useCallback((flags: string): string => {
    return flags
      .split(/\s+/)
      .filter((f) => f && !f.startsWith('-XX:') && !f.startsWith('-Dusing.aikars.flags') && !f.startsWith('-Daikars.new.flags'))
      .join(' ');
  }, []);

  const handleToggleAikarFlags = (checked: boolean) => {
    if (checked) {
      const customFlags = stripAikarFlags(jvmFlags);
      const aikarString = aikarComputed.flags.join(' ');
      form.setValue('jvm_flags', customFlags ? `${aikarString} ${customFlags}` : aikarString);
    } else {
      form.setValue('jvm_flags', stripAikarFlags(jvmFlags));
    }
  };

  useEffect(() => {
    if (!hasAikarFlags) return;
    const customFlags = stripAikarFlags(jvmFlags);
    const aikarString = aikarComputed.flags.join(' ');
    const nextFlags = customFlags ? `${aikarString} ${customFlags}` : aikarString;
    if (nextFlags !== jvmFlags) form.setValue('jvm_flags', nextFlags);
  }, [aikarComputed, hasAikarFlags, jvmFlags, stripAikarFlags, form]);

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
                  {hasAikarFlags && (
                    <div className={'mt-3 space-y-2'}>
                      {aikarComputed.warnings.map((warningKey) => (
                        <Alert key={warningKey} variant={'warning'}>
                          <AlertTriangle className={'size-4'} />
                          <AlertDescription>{t(`settings.aikarWarnings.${warningKey}`, warningKey)}</AlertDescription>
                        </Alert>
                      ))}
                      <details className={'text-xs'}>
                        <summary
                          className={
                            'cursor-pointer text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }
                        >
                          {t('settings.aikarPreview')} ({aikarComputed.flags.length})
                        </summary>
                        <ul className={'mt-2 space-y-1'}>
                          {aikarComputed.explanations.map(({ flag, reasonKey }) => (
                            <li key={flag} className={'flex flex-col gap-0.5'}>
                              <code className={'font-jetbrains text-[11px] text-zinc-700 dark:text-zinc-300'}>{flag}</code>
                              <span className={'text-[11px] text-zinc-500 dark:text-zinc-500'}>
                                {t(`settings.aikarReasons.${reasonKey}`, reasonKey)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
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
          <FeatureCard.Footer alert>
            <Alert variant={'warning'}>
              <Info className={'size-4'} />
              <AlertDescription>{t('settings.restartRequired')}</AlertDescription>
            </Alert>
          </FeatureCard.Footer>
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

type JarInfo = {
  name: string;
  size: number;
  modified: string;
  isActive: boolean;
  source: string;
};

function JarRow({
  jar,
  setActiveJar,
  deleteJar,
}: {
  jar: JarInfo;
  setActiveJar: { mutateAsync: (jar: string) => Promise<unknown>; isPending: boolean };
  deleteJar: { mutateAsync: (jar: string) => Promise<unknown>; isPending: boolean };
}) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canActive = can('server:jars:activate');
  const canDelete = can('server:jars:delete');

  const [activateConfirm, setActivateConfirm] = useState(false);
  const [gateJarName, setGateJarName] = useState<string | null>(null);

  const handleSetActive = async () => {
    if (!canActive) return;
    try {
      await setActiveJar.mutateAsync(jar.name);
      setActivateConfirm(false);
    } catch {}
  };

  return (
    <>
      <FeatureCard.Row className={'items-center py-3'}>
        <div className={'flex items-center gap-3'}>
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity',
              jar.isActive ? 'bg-green-600 text-white' : 'bg-zinc-300 opacity-40 dark:text-zinc-800'
            )}
          >
            <Package className={'size-4'} strokeWidth={2} />
          </div>
          <div>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{jar.name}</span>
              {jar.isActive && <Badge variant={'success'}>{t('settings.active')}</Badge>}
              {jar.source === 'custom' && <Badge variant={'secondary'}>{t('settings.customJar')}</Badge>}
            </div>
            <div className={'mt-0.5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'font-jetbrains tabular-nums'}>{formatJarSize(jar.size)}</span>
              <span className={'text-zinc-200 dark:text-zinc-700'}>&middot;</span>
              <span>{new Date(jar.modified).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className={'flex shrink-0 items-center gap-1.5'}>
          {activateConfirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button
                onClick={handleSetActive}
                variant={'success'}
                size={'xs'}
                disabled={setActiveJar.isPending}
                loading={setActiveJar.isPending}
              >
                {t('common.yes')}
              </Button>
              <Button onClick={() => setActivateConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : !jar.isActive ? (
            <>
              {canActive && (
                <Button onClick={() => setActivateConfirm(true)} variant={'secondary'} size={'xs'}>
                  <Check className={'size-4'} />
                  {t('settings.activate')}
                </Button>
              )}
              {canDelete && (
                <Button onClick={() => setGateJarName(jar.name)} variant={'ghost-destructive'} size={'icon-sm'}>
                  <Trash2 className={'size-4'} />
                </Button>
              )}
            </>
          ) : null}
        </div>
      </FeatureCard.Row>
      <PasswordGate
        open={gateJarName !== null}
        onOpenChange={(open) => !open && setGateJarName(null)}
        title={t('settings.deleteJar')}
        description={t('settings.deleteJarDescription')}
        confirmLabel={t('settings.deleteJar')}
        destructive
        onConfirm={async () => {
          if (gateJarName !== null) await deleteJar.mutateAsync(gateJarName);
        }}
      />
    </>
  );
}
