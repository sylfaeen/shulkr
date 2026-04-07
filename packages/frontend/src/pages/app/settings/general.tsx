import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Copy, Globe, Info, Lock, Coffee, Trash2, Loader2 } from 'lucide-react';
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
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';

export function SettingsGeneralPage() {
  const { t } = useTranslation();

  usePageTitle('shulkr • ' + t('nav.settings'));

  return (
    <PageContent>
      <div className={'space-y-6'}>
        <FeatureCard.Stack>
          <PanelDomainSection />
          <JavaSection />
        </FeatureCard.Stack>
      </div>
    </PageContent>
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
      <FeatureCard.Body>
        {panelDomain ? (
          <>
            <FeatureCard.Row className={'items-center gap-8 py-3'}>
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
                      >
                        <Lock className={'size-3.5'} />
                        {t('settings.domains.enableSsl')}
                      </Button>
                    )}
                    <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'}>
                      <Trash2 className={'size-4'} />
                    </Button>
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
              <Alert variant={'warning'} className={'mt-3'}>
                <Info className={'size-4'} />
                <AlertDescription>{t('appSettings.panelDomain.restartWarning')}</AlertDescription>
              </Alert>
              {panelDomain.sslEnabled && (
                <div className={'mt-3 rounded-lg border border-green-500/20 bg-green-50/50 p-3 dark:bg-green-950/20'}>
                  <div className={'flex items-center gap-2'}>
                    <CheckCircle2 className={'size-4 shrink-0 text-green-600'} strokeWidth={2} />
                    <p className={'text-sm font-medium text-green-800 dark:text-green-200'}>
                      {t('appSettings.panelDomain.sslSuccess')}
                    </p>
                  </div>
                  <a
                    href={`https://${panelDomain.domain}`}
                    className={
                      'mt-2 inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700'
                    }
                  >
                    <Globe className={'size-3.5'} />
                    {t('appSettings.panelDomain.goToPanel', { domain: panelDomain.domain })}
                  </a>
                </div>
              )}
            </div>
          </>
        ) : (
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
                >
                  <Globe className={'size-4'} />
                  {t('appSettings.panelDomain.configure')}
                </Button>
              </div>
              {domainInput && !isValidDomain && (
                <p className={'mt-1 text-sm text-red-500'}>{t('settings.domains.invalidDomain')}</p>
              )}
            </div>
          </div>
        )}
      </FeatureCard.Body>
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
