import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Copy, Globe, Info, Lock, Coffee, Trash2, Loader2, HardDrive, Server } from 'lucide-react';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { cn } from '@shulkr/frontend/lib/cn';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useInstalledJava } from '@shulkr/frontend/hooks/use_java';
import {
  usePanelDomain,
  useSetPanelDomain,
  useRemovePanelDomain,
  useEnablePanelSsl,
  useServerIp,
} from '@shulkr/frontend/hooks/use_domains';
import { useSftpInfo } from '@shulkr/frontend/hooks/use_sftp';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { formatFileSize } from '@shulkr/frontend/hooks/use_files';

export function SettingsGeneralPage() {
  const { t } = useTranslation();
  usePageTitle('shulkr • ' + t('nav.settings'));
  return (
    <PageContent>
      <div className={'space-y-6'}>
        <FeatureCard.Stack>
          <DiskUsageSection />
          <PanelDomainSection />
          <SftpSection />
          <JavaSection />
        </FeatureCard.Stack>
      </div>
    </PageContent>
  );
}

function DiskUsageSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'diskUsage'],
    queryFn: async () => {
      const result = await apiClient.settings.getDiskUsage();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
  const { data: serverSizes, isLoading: serverSizesLoading } = useQuery({
    queryKey: ['settings', 'serverSizes'],
    queryFn: async () => {
      const result = await apiClient.settings.getServerSizes();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
  const shulkrTotal = serverSizes?.reduce((sum, s) => sum + s.size, 0) ?? 0;
  const diskPercent = data ? Math.round((data.disk.used / data.disk.total) * 100) : 0;
  const shulkrPercent = data ? Math.round((shulkrTotal / data.disk.total) * 100) : 0;
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('appSettings.diskUsage.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('appSettings.diskUsage.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {isLoading ? (
          <div className={'py-8'}>
            <Loader2 className={'mx-auto size-5 animate-spin text-zinc-400 dark:text-zinc-500'} />
          </div>
        ) : data ? (
          <>
            <FeatureCard.Row layout={'column'} className={'gap-3'}>
              <div className={'flex w-full items-center justify-between'}>
                <div className={'flex items-center gap-2'}>
                  <HardDrive className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
                  <span className={'text-sm font-medium'}>{t('appSettings.diskUsage.systemDisk')}</span>
                </div>
                <span className={'font-jetbrains text-sm text-zinc-600 tabular-nums dark:text-zinc-400'}>
                  {formatFileSize(data.disk.used)} / {formatFileSize(data.disk.total)}
                </span>
              </div>
              <div className={'h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800'}>
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    diskPercent >= 90 ? 'bg-red-500' : diskPercent >= 75 ? 'bg-amber-500' : 'bg-green-500'
                  )}
                  style={{ width: `${diskPercent}%` }}
                />
              </div>
              <div className={'flex w-full justify-between text-xs text-zinc-500 dark:text-zinc-400'}>
                <span>
                  {t('appSettings.diskUsage.used')}: {diskPercent}%
                </span>
                <span>
                  {t('appSettings.diskUsage.available')}: {formatFileSize(data.disk.available)}
                </span>
              </div>
            </FeatureCard.Row>
            <FeatureCard.Row layout={'column'} className={'gap-3'}>
              <div className={'flex w-full items-center justify-between'}>
                <div className={'flex items-center gap-2'}>
                  <Server className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
                  <span className={'text-sm font-medium'}>{t('appSettings.diskUsage.shulkrUsage')}</span>
                </div>
                <span className={'font-jetbrains text-sm text-zinc-600 tabular-nums dark:text-zinc-400'}>
                  {serverSizesLoading ? (
                    <Loader2 className={'inline size-3.5 animate-spin'} />
                  ) : (
                    <>
                      {formatFileSize(shulkrTotal)} ({shulkrPercent}%)
                    </>
                  )}
                </span>
              </div>
              {serverSizesLoading ? (
                <div className={'flex w-full justify-end py-2'}>
                  <Loader2 className={'size-4 animate-spin text-zinc-400 dark:text-zinc-500'} />
                </div>
              ) : (
                serverSizes &&
                serverSizes.length > 0 && (
                  <div className={'w-full space-y-1.5'}>
                    {serverSizes.map((server) => (
                      <div key={server.id} className={'flex items-center justify-between'}>
                        <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{server.name}</span>
                        <span className={'font-jetbrains text-sm text-zinc-500 tabular-nums dark:text-zinc-400'}>
                          {formatFileSize(server.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </FeatureCard.Row>
          </>
        ) : null}
      </FeatureCard.Body>
    </FeatureCard>
  );
}

function PanelDomainSection() {
  const { t } = useTranslation();
  const [domainInput, setDomainInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: panelData } = usePanelDomain();
  const setPanelDomain = useSetPanelDomain();
  const removePanelDomain = useRemovePanelDomain();
  const enableSsl = useEnablePanelSsl();
  const serverIp = useServerIp();
  const panelDomain = panelData?.domain ?? null;
  const isValidDomain =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(
      domainInput
    );
  const isExpiringSoon =
    panelDomain?.sslExpiresAt && new Date(panelDomain.sslExpiresAt).getTime() - Date.now() < 14 * 24 * 60 * 60 * 1000;
  const handleSet = async () => {
    if (!isValidDomain) return;
    await setPanelDomain.mutateAsync(domainInput.trim().toLowerCase());
    setDomainInput('');
  };
  const handleRemove = async () => {
    try {
      await removePanelDomain.mutateAsync();
      setDeleteConfirm(false);
    } catch {}
  };
  const handleCopy = () => {
    copyToClipboard(serverIp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('appSettings.panelDomain.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('appSettings.panelDomain.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      {panelDomain ? (
        <>
          <FeatureCard.Body>
            <FeatureCard.Row className={'items-center py-3'}>
              <div className={'flex items-center gap-3'}>
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    panelDomain.sslEnabled ? 'bg-green-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'
                  )}
                >
                  {panelDomain.sslEnabled ? (
                    <Lock className={'size-4'} strokeWidth={2} />
                  ) : (
                    <Globe className={'size-4'} strokeWidth={2} />
                  )}
                </div>
                <div className={'min-w-0'}>
                  <div className={'flex items-center gap-2'}>
                    <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
                      {panelDomain.domain}
                    </span>
                    {panelDomain.sslEnabled ? (
                      <Badge variant={isExpiringSoon ? 'outline' : 'default'} className={'font-semibold'}>
                        {isExpiringSoon ? t('settings.domains.sslExpiringSoon') : 'SSL'}
                      </Badge>
                    ) : (
                      <Badge variant={'secondary'} className={'font-semibold'}>
                        {t('settings.domains.noSsl')}
                      </Badge>
                    )}
                  </div>
                  {panelDomain.sslExpiresAt && (
                    <span className={'text-sm text-zinc-500 dark:text-zinc-400'}>
                      {t('settings.domains.expiresAt', { date: new Date(panelDomain.sslExpiresAt).toLocaleDateString() })}
                    </span>
                  )}
                </div>
              </div>
              <FeatureCard.RowControl>
                {deleteConfirm ? (
                  <div className={'flex items-center gap-1.5'}>
                    <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
                    <Button
                      onClick={handleRemove}
                      variant={'destructive'}
                      size={'xs'}
                      disabled={removePanelDomain.isPending}
                      loading={removePanelDomain.isPending}
                    >
                      {t('common.yes')}
                    </Button>
                    <Button onClick={() => setDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
                      {t('common.no')}
                    </Button>
                  </div>
                ) : (
                  <>
                    {!panelDomain.sslEnabled && (
                      <Button
                        onClick={async () => await enableSsl.mutateAsync(panelDomain.id)}
                        variant={'success'}
                        size={'xs'}
                        disabled={enableSsl.isPending}
                        loading={enableSsl.isPending}
                        icon={Lock}
                        iconClass={'size-3'}
                      >
                        {t('settings.domains.enableSsl')}
                      </Button>
                    )}
                    <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'} icon={Trash2} />
                  </>
                )}
              </FeatureCard.RowControl>
            </FeatureCard.Row>
            <div className={'border-t border-black/6 px-5 py-4 dark:border-white/6'}>
              <div className={'rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-800/50'}>
                <div className={'flex items-center justify-between'}>
                  <div className={'font-jetbrains text-sm'}>
                    <span className={'text-zinc-500'}>A</span>
                    <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                    <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{panelDomain.domain}</span>
                    <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                    <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{serverIp}</span>
                  </div>
                  <Button onClick={handleCopy} variant={'ghost'} size={'icon-sm'}>
                    {copied ? <CheckCircle2 className={'size-3.5 text-green-600'} /> : <Copy className={'size-3.5'} />}
                  </Button>
                </div>
              </div>
            </div>
          </FeatureCard.Body>
          <FeatureCard.Footer alert>
            <Alert variant={'warning'} className={'mt-3'}>
              <Info className={'size-4'} />
              <AlertDescription>{t('appSettings.panelDomain.restartWarning')}</AlertDescription>
            </Alert>
            {panelDomain.sslEnabled && (
              <Alert variant={'success'} className={'mt-3'}>
                <CheckCircle2 className={'size-4'} />
                <AlertDescription>
                  <p className={'font-medium'}>{t('appSettings.panelDomain.sslSuccess')}</p>
                  <a
                    href={`https://${panelDomain.domain}`}
                    className={
                      'mt-2 inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700'
                    }
                  >
                    <Globe className={'size-3.5'} />
                    {t('appSettings.panelDomain.goToPanel', { domain: panelDomain.domain })}
                  </a>
                </AlertDescription>
              </Alert>
            )}
          </FeatureCard.Footer>
        </>
      ) : (
        <FeatureCard.Body>
          <div className={'space-y-0 divide-y divide-black/4 dark:divide-white/6'}>
            <SetupSteps {...{ serverIp }} />
            <div className={'px-5 py-4'}>
              <div className={'flex items-end gap-2'}>
                <div className={'flex-1'}>
                  <Label htmlFor={'panel-domain'} className={'mb-1.5 block text-sm text-zinc-600 dark:text-zinc-400'}>
                    {t('appSettings.panelDomain.step2Label')}
                  </Label>
                  <Input
                    type={'text'}
                    id={'panel-domain'}
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder={'panel.example.com'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isValidDomain) handleSet();
                    }}
                  />
                </div>
                <Button
                  onClick={handleSet}
                  disabled={!isValidDomain || setPanelDomain.isPending}
                  loading={setPanelDomain.isPending}
                  icon={Globe}
                >
                  {t('appSettings.panelDomain.configure')}
                </Button>
              </div>
              {domainInput && !isValidDomain && (
                <p className={'mt-1 text-sm text-red-500'}>{t('settings.domains.invalidDomain')}</p>
              )}
            </div>
          </div>
        </FeatureCard.Body>
      )}
    </FeatureCard>
  );
}

function SetupSteps({ serverIp }: { serverIp: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(serverIp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className={'px-5 py-4'}>
      <div className={'space-y-4'}>
        <div className={'flex gap-3'}>
          <div
            className={
              'flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }
          >
            1
          </div>
          <div className={'flex-1'}>
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('appSettings.panelDomain.step1Title')}</p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('appSettings.panelDomain.step1Desc')}</p>
            <div className={'mt-2 rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-800/50'}>
              <div className={'flex items-center justify-between'}>
                <div className={'font-jetbrains text-sm'}>
                  <span className={'text-zinc-500'}>A</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>panel.yourdomain.com</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{serverIp}</span>
                </div>
                <Button onClick={handleCopy} variant={'ghost'} size={'icon-sm'}>
                  {copied ? <CheckCircle2 className={'size-3.5 text-green-600'} /> : <Copy className={'size-3.5'} />}
                </Button>
              </div>
            </div>
            <p className={'mt-1.5 text-xs text-zinc-400 dark:text-zinc-500'}>{t('appSettings.panelDomain.step1Hint')}</p>
          </div>
        </div>
        <div className={'flex gap-3'}>
          <div
            className={
              'flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }
          >
            2
          </div>
          <div className={'flex-1'}>
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('appSettings.panelDomain.step2Title')}</p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('appSettings.panelDomain.step2Desc')}</p>
          </div>
        </div>
        <div className={'flex gap-3'}>
          <div
            className={
              'flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }
          >
            3
          </div>
          <div className={'flex-1'}>
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('appSettings.panelDomain.step3Title')}</p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('appSettings.panelDomain.step3Desc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SftpSection() {
  const { t } = useTranslation();
  const { data: sftpInfo, isLoading } = useSftpInfo();
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('appSettings.sftp.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('appSettings.sftp.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {isLoading ? (
          <div className={'py-8'}>
            <Loader2 className={'mx-auto size-5 animate-spin text-zinc-400 dark:text-zinc-500'} />
          </div>
        ) : (
          <div className={'grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-black/5 dark:bg-white/5'}>
            <ConnectionInfoCell label={t('appSettings.sftp.host')} value={sftpInfo?.host ?? '—'} copyable />
            <ConnectionInfoCell label={t('appSettings.sftp.port')} value={String(sftpInfo?.port ?? '—')} copyable />
            <ConnectionInfoCell label={t('appSettings.sftp.username')} value={'shulkr'} copyable />
            <ConnectionInfoCell label={t('appSettings.sftp.password')} value={t('appSettings.sftp.passwordHint')} />
          </div>
        )}
      </FeatureCard.Body>
      <FeatureCard.Footer alert>
        <Alert variant={'warning'}>
          <Info className={'size-4'} />
          <AlertDescription>{t('appSettings.sftp.changePasswordHint')}</AlertDescription>
        </Alert>
      </FeatureCard.Footer>
    </FeatureCard>
  );
}

function ConnectionInfoCell({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!copyable) return;
    copyToClipboard(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const Tag = copyable ? 'button' : 'div';
  return (
    <Tag
      type={copyable ? 'button' : undefined}
      onClick={copyable ? handleCopy : undefined}
      className={cn(
        'flex flex-col gap-1 bg-white px-5 py-3.5 text-left dark:bg-zinc-900',
        copyable && 'group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/80'
      )}
    >
      <span className={'text-xs font-medium text-zinc-400 dark:text-zinc-500'}>{label}</span>
      <span className={'flex items-center gap-2'}>
        <span className={'font-jetbrains text-sm font-semibold text-zinc-800 dark:text-zinc-200'}>{value}</span>
        {copyable &&
          (copied ? (
            <CheckCircle2 className={'size-3 text-green-500'} strokeWidth={3} />
          ) : (
            <Copy
              className={
                'size-3 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400'
              }
            />
          ))}
      </span>
    </Tag>
  );
}

function JavaSection() {
  const { t } = useTranslation();
  const { data: javaVersions, isLoading } = useInstalledJava();
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title count={javaVersions && javaVersions.length > 0 && javaVersions.length}>
            {t('appSettings.java.title')}
          </FeatureCard.Title>
          <FeatureCard.Description>{t('appSettings.java.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {isLoading ? (
          <div className={'py-8'}>
            <Loader2 className={'mx-auto size-5 animate-spin text-zinc-400 dark:text-zinc-500'} />
          </div>
        ) : !javaVersions?.length ? (
          <FeatureCard.Row>
            <p className={'w-full py-2 text-center text-sm text-zinc-500 dark:text-zinc-400'}>
              {t('appSettings.java.noVersions')}
            </p>
          </FeatureCard.Row>
        ) : (
          javaVersions.map((java) => (
            <FeatureCard.Row key={java.name}>
              <FeatureCard.RowLabel description={<span className={'font-jetbrains'}>{java.path}</span>}>
                <div className={'flex items-center gap-2'}>
                  <Coffee className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
                  <span>{java.name}</span>
                </div>
              </FeatureCard.RowLabel>
              <FeatureCard.RowControl>
                <span className={'text-sm text-zinc-500 dark:text-zinc-400'}>Java {java.version}</span>
                {java.isDefault && <Badge variant={'outline'}>{t('appSettings.java.default')}</Badge>}
              </FeatureCard.RowControl>
            </FeatureCard.Row>
          ))
        )}
      </FeatureCard.Body>
    </FeatureCard>
  );
}
