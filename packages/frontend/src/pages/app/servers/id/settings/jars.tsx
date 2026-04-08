import { useState, useRef, type ChangeEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Download, LoaderCircle, Package, Trash2, Upload } from 'lucide-react';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
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
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { ApiError } from '@shulkr/frontend/lib/api';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerSettingsJarsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const serverId = id || '';
  const { data: server, isLoading: serverLoading } = useServer(serverId);

  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsJars')}` : t('nav.settingsJars'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <PageLoader />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Package} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('settings.jarManagement')}</ServerPageHeader.PageName>
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
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function JarListSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

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
            <Button onClick={() => fileInputRef.current?.click()} loading={uploadJar.isPending} disabled={uploadJar.isPending}>
              <Upload className={'size-4'} />
              {t('settings.jarUpload.upload')}
            </Button>
            <input ref={fileInputRef} type={'file'} accept={'.jar'} multiple onChange={handleFileSelect} className={'hidden'} />
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

const PAPERMC_PROJECTS: Array<{ value: PaperMCProject; label: string }> = [
  { value: 'paper', label: 'Paper' },
  { value: 'folia', label: 'Folia' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'waterfall', label: 'Waterfall' },
];

function PaperMCSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

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

  const handleProjectChange = (value: string) => {
    setSelectedProject(value as PaperMCProject);
    setSelectedVersion(null);
    setSelectedBuild(null);
  };

  const handleDownload = async () => {
    if (!selectedVersion) return;
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
          <div className={'flex flex-wrap items-end gap-3'}>
            <div className={'flex-1'}>
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
            <div className={'flex-1'}>
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
            <div className={'flex-1'}>
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
  const [activateConfirm, setActivateConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleSetActive = async () => {
    try {
      await setActiveJar.mutateAsync(jar.name);
      setActivateConfirm(false);
    } catch {}
  };

  const handleDelete = async () => {
    try {
      await deleteJar.mutateAsync(jar.name);
      setDeleteConfirm(false);
    } catch {}
  };

  return (
    <FeatureCard.Row className={'items-center gap-8 py-3'}>
      <div className={'flex items-center gap-3'}>
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity',
            jar.isActive ? 'bg-green-600 text-white' : 'bg-zinc-300 opacity-40'
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
        ) : deleteConfirm ? (
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
            <Button
              onClick={handleDelete}
              variant={'destructive'}
              size={'xs'}
              disabled={deleteJar.isPending}
              loading={deleteJar.isPending}
            >
              {t('common.yes')}
            </Button>
            <Button onClick={() => setDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
              {t('common.no')}
            </Button>
          </div>
        ) : !jar.isActive ? (
          <>
            <Button onClick={() => setActivateConfirm(true)} variant={'secondary'} size={'xs'}>
              <Check className={'size-4'} />
              {t('settings.activate')}
            </Button>
            <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'}>
              <Trash2 className={'size-4'} />
            </Button>
          </>
        ) : null}
      </div>
    </FeatureCard.Row>
  );
}
