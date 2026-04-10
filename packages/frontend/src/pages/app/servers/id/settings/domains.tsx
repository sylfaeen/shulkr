import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronDown, Copy, Globe, Gamepad2, Lock, Plus, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  useDomains,
  useAddDomain,
  useRemoveDomain,
  useEnableSsl,
  useRenewSsl,
  useServerIp,
} from '@shulkr/frontend/hooks/use_domains';
import { AddDomainDialog } from '@shulkr/frontend/pages/app/servers/dialogs/add_domain_dialog';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import type { DomainType } from '@shulkr/shared';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerSettingsDomainsPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsDomains')}` : t('nav.settingsDomains'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Globe} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('settings.domains.title')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/domains'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('settings.domains.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <PlayerDomainSection serverId={server.id} />
          <HttpDomainListSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function PlayerDomainSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const [showForm, setShowForm] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  const { data: server } = useServer(serverId);
  const { data: domainsData } = useDomains(serverId);
  const serverIp = useServerIp();
  const addDomain = useAddDomain(serverId);
  const removeDomain = useRemoveDomain(serverId);

  const connectionDomains = domainsData?.domains?.filter((d) => d.type === 'connection') ?? [];
  const serverPort = server?.java_port ?? 25565;
  const isValidDomain = DOMAIN_REGEX.test(domainInput);

  const handleAdd = async () => {
    if (!isValidDomain) return;
    await addDomain.mutateAsync({ domain: domainInput.trim().toLowerCase(), port: serverPort, type: 'connection' });
    setDomainInput('');
    setShowForm(false);
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title count={connectionDomains.length > 0 && connectionDomains.length}>
            {t('settings.domains.playerDomain.title')}
          </FeatureCard.Title>
          <FeatureCard.Description>{t('settings.domains.playerDomain.description')}</FeatureCard.Description>
        </FeatureCard.Content>
        {connectionDomains.length > 0 && (
          <FeatureCard.Actions>
            <Button onClick={() => setShowForm(!showForm)} size={'sm'}>
              <Plus className={'size-4'} />
              {t('settings.domains.playerDomain.addDomain')}
            </Button>
          </FeatureCard.Actions>
        )}
      </FeatureCard.Header>
      <FeatureCard.Body>
        {connectionDomains.length === 0 ? (
          <PlayerDomainSetupSteps
            port={serverPort}
            onDomainInputChange={setDomainInput}
            onSubmit={handleAdd}
            isPending={addDomain.isPending}
            {...{ serverIp, domainInput, isValidDomain }}
          />
        ) : (
          <>
            {connectionDomains.map((domain) => (
              <ConnectionDomainRow key={domain.id} domain={domain} onRemove={removeDomain} {...{ serverIp }} />
            ))}
            {showForm && (
              <div className={'border-t border-black/6 dark:border-white/6'}>
                <PlayerDomainSetupSteps
                  port={serverPort}
                  onDomainInputChange={setDomainInput}
                  onSubmit={handleAdd}
                  isPending={addDomain.isPending}
                  {...{ serverIp, domainInput, isValidDomain }}
                />
              </div>
            )}
          </>
        )}
      </FeatureCard.Body>
    </FeatureCard>
  );
}

type ConnectionDomainData = {
  id: number;
  domain: string;
  port: number | null;
  type: string;
  sslEnabled: boolean;
  sslExpiresAt: string | null;
};

function ConnectionDomainRow({
  domain,
  serverIp,
  onRemove,
}: {
  domain: ConnectionDomainData;
  serverIp: string;
  onRemove: { mutateAsync: (id: number) => Promise<unknown>; isPending: boolean };
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDelete = async () => {
    try {
      await onRemove.mutateAsync(domain.id);
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
    <div>
      <FeatureCard.Row className={'items-center gap-8 py-3'}>
        <button type={'button'} className={'flex flex-1 items-center gap-3 text-left'} onClick={() => setExpanded(!expanded)}>
          <div className={'flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white'}>
            <Gamepad2 className={'size-4'} strokeWidth={2} />
          </div>
          <div className={'min-w-0 flex-1'}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{domain.domain}</span>
              <Badge variant={'secondary'} className={'font-medium uppercase'}>
                SRV
              </Badge>
            </div>
            <span className={'mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'font-jetbrains tabular-nums'}>:{domain.port}</span>
            </span>
          </div>
          <ChevronDown
            className={cn('size-4 shrink-0 text-zinc-400 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </button>
        <FeatureCard.RowControl>
          {deleteConfirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button
                onClick={handleDelete}
                variant={'destructive'}
                size={'xs'}
                disabled={onRemove.isPending}
                loading={onRemove.isPending}
              >
                {t('common.yes')}
              </Button>
              <Button onClick={() => setDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'}>
              <Trash2 className={'size-4'} />
            </Button>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      {expanded && (
        <div className={'border-t border-black/6 px-5 py-4 dark:border-white/6'}>
          <div className={'space-y-2'}>
            <div className={'rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-800/50'}>
              <div className={'flex items-center justify-between'}>
                <div className={'font-jetbrains text-sm'}>
                  <span className={'text-zinc-500'}>A</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{domain.domain}</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{serverIp}</span>
                </div>
                <Button onClick={handleCopy} variant={'ghost'} size={'icon-sm'}>
                  {copied ? <CheckCircle2 className={'size-3.5 text-green-600'} /> : <Copy className={'size-3.5'} />}
                </Button>
              </div>
            </div>
            <SrvRegistrarTable domain={domain.domain} port={domain.port ?? 25565} />
          </div>
          <div className={'mt-3 rounded-lg border border-blue-500/20 bg-blue-50/50 p-3 dark:bg-blue-950/20'}>
            <p className={'text-sm font-medium text-blue-800 dark:text-blue-200'}>
              {t('settings.domains.playerDomain.connectionInfo')}
            </p>
            <div className={'mt-2 space-y-1'}>
              <div className={'flex items-center gap-2'}>
                <CheckCircle2 className={'size-3.5 shrink-0 text-blue-600 dark:text-blue-400'} strokeWidth={2} />
                <span className={'font-jetbrains text-sm text-blue-700 dark:text-blue-300'}>{domain.domain}</span>
                <span className={'text-xs text-blue-500 dark:text-blue-400'}>{t('settings.domains.playerDomain.withSrv')}</span>
              </div>
              <div className={'flex items-center gap-2'}>
                <CheckCircle2 className={'size-3.5 shrink-0 text-blue-600 dark:text-blue-400'} strokeWidth={2} />
                <span className={'font-jetbrains text-sm text-blue-700 dark:text-blue-300'}>
                  {`${domain.domain}:${domain.port}`}
                </span>
                <span className={'text-xs text-blue-500 dark:text-blue-400'}>
                  {t('settings.domains.playerDomain.withoutSrv')}
                </span>
              </div>
            </div>
          </div>
          <p className={'mt-2 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.domains.dnsHint')}</p>
        </div>
      )}
    </div>
  );
}

function PlayerDomainSetupSteps({
  serverIp,
  port,
  domainInput,
  onDomainInputChange,
  onSubmit,
  isValidDomain,
  isPending,
}: {
  serverIp: string;
  port: number;
  domainInput: string;
  onDomainInputChange: (value: string) => void;
  onSubmit: () => void;
  isValidDomain: boolean;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const displayDomain = domainInput.trim() || 'play.example.com';

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
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
              {t('settings.domains.playerDomain.step1Title')}
            </p>
            <div className={'mt-2 max-w-md'}>
              <Input
                type={'text'}
                id={'player-domain'}
                value={domainInput}
                onChange={(e) => onDomainInputChange(e.target.value)}
                placeholder={'play.example.com'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValidDomain) onSubmit();
                }}
              />
              {domainInput && !isValidDomain && (
                <p className={'mt-1 text-sm text-red-500'}>{t('settings.domains.invalidDomain')}</p>
              )}
            </div>
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
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
              {t('settings.domains.playerDomain.step2Title')}
            </p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.domains.playerDomain.step2Desc')}</p>
            <div className={'mt-2 rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-800/50'}>
              <div className={'flex items-center justify-between'}>
                <div className={'font-jetbrains text-sm'}>
                  <span className={'text-zinc-500'}>A</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{displayDomain}</span>
                  <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
                  <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{serverIp}</span>
                </div>
                <Button onClick={handleCopy} variant={'ghost'} size={'icon-sm'}>
                  {copied ? <CheckCircle2 className={'size-3.5 text-green-600'} /> : <Copy className={'size-3.5'} />}
                </Button>
              </div>
            </div>
            <p className={'mt-1.5 text-xs text-zinc-400 dark:text-zinc-500'}>{t('settings.domains.playerDomain.step2Hint')}</p>
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
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
              {t('settings.domains.playerDomain.step3Title')}
            </p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.domains.playerDomain.step3Desc')}</p>
            <div className={'mt-2'}>
              <SrvRegistrarTable domain={displayDomain} {...{ port }} />
            </div>
            <p className={'mt-1.5 text-xs text-zinc-400 dark:text-zinc-500'}>{t('settings.domains.playerDomain.step3Hint')}</p>
          </div>
        </div>
        <div className={'flex gap-3'}>
          <div
            className={
              'flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }
          >
            4
          </div>
          <div className={'flex-1'}>
            <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
              {t('settings.domains.playerDomain.step4Title')}
            </p>
            <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.domains.playerDomain.step4Desc')}</p>
            <div className={'mt-2'}>
              <Button onClick={onSubmit} size={'sm'} disabled={!isValidDomain || isPending} loading={isPending}>
                {t('settings.domains.playerDomain.configure')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SrvRegistrarTable({ domain, port }: { domain: string; port: number }) {
  const { t } = useTranslation();
  const protocol = getSrvProtocol(domain);
  const subdomain = getSrvSubdomain(domain);

  const fields = [
    { label: t('settings.domains.playerDomain.srvPriority'), value: '0' },
    { label: t('settings.domains.playerDomain.srvWeight'), value: '5' },
    { label: t('settings.domains.playerDomain.srvPort'), value: String(port) },
    { label: t('settings.domains.playerDomain.srvTarget'), value: `${domain}.` },
    { label: t('settings.domains.playerDomain.srvTtl'), value: '600' },
  ];

  return (
    <div className={'rounded-lg border border-black/6 bg-zinc-50/50 dark:border-white/6 dark:bg-zinc-800/50'}>
      <div className={'px-3 py-2'}>
        <span className={'text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400'}>
          {t('settings.domains.playerDomain.srvFields')}
        </span>
      </div>
      <div className={'divide-y divide-black/4 border-t border-black/6 dark:divide-white/6 dark:border-white/6'}>
        <div className={'flex items-center justify-between px-3 py-1.5'}>
          <span className={'text-xs text-zinc-500 dark:text-zinc-400'}>
            {t('settings.domains.playerDomain.srvService')} / {t('settings.domains.playerDomain.srvProtocol')}
          </span>
          <TooltipProvider delayDuration={200}>
            <span className={'font-jetbrains text-sm font-medium'}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={'cursor-help text-zinc-800 dark:text-zinc-200'}>_minecraft.</span>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                  {t('settings.domains.playerDomain.srvService')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'cursor-help',
                      subdomain ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-200'
                    )}
                  >
                    {protocol}
                  </span>
                </TooltipTrigger>
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                  {t('settings.domains.playerDomain.srvProtocol')}
                </TooltipContent>
              </Tooltip>
            </span>
          </TooltipProvider>
        </div>
        {fields.map((field) => (
          <div key={field.label} className={'flex items-center justify-between px-3 py-1.5'}>
            <span className={'text-xs text-zinc-500 dark:text-zinc-400'}>{field.label}</span>
            <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{field.value}</span>
          </div>
        ))}
      </div>
      <div className={'space-y-0 border-t border-black/6 dark:border-white/6'}>
        <div className={'px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500'}>
          <p>{t('settings.domains.playerDomain.srvTargetHint', { domain })}</p>
          <p>{t('settings.domains.playerDomain.srvTtlHint')}</p>
        </div>
      </div>
    </div>
  );
}

function HttpDomainListSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: server } = useServer(serverId);
  const { data: domainsData } = useDomains(serverId);
  const serverIp = useServerIp();
  const addDomain = useAddDomain(serverId);
  const removeDomain = useRemoveDomain(serverId);
  const enableSsl = useEnableSsl(serverId);
  const renewSsl = useRenewSsl(serverId);

  const httpDomains = domainsData?.domains?.filter((d) => d.type !== 'connection' && d.type !== 'panel') ?? [];
  const sslCount = httpDomains.filter((d) => d.sslEnabled).length;
  const hasSsl = sslCount > 0;

  const handleAdd = async (input: { domain: string; port: number; type: DomainType }) => {
    await addDomain.mutateAsync(input);
    setDialogOpen(false);
  };

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={httpDomains.length > 0 && `${sslCount}/${httpDomains.length} SSL`}>
              {t('settings.domains.title')}
            </FeatureCard.Title>
            <FeatureCard.Description>{t('settings.domains.description')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions>
            {hasSsl && (
              <Button
                onClick={() => renewSsl.mutateAsync()}
                variant={'secondary'}
                size={'sm'}
                disabled={renewSsl.isPending}
                loading={renewSsl.isPending}
              >
                <RotateCcw className={'size-4'} />
                {t('settings.domains.renewSsl')}
              </Button>
            )}
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className={'size-4'} />
              {t('settings.domains.addDomain')}
            </Button>
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {httpDomains.length === 0 ? (
            <FeatureCard.Empty
              icon={Globe}
              title={t('settings.domains.noDomains')}
              description={t('settings.domains.noDomainsHint')}
            />
          ) : (
            <>
              {httpDomains.map((domain) => (
                <DomainRow key={domain.id} onRemove={removeDomain} onEnableSsl={enableSsl} {...{ domain, serverIp }} />
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <AddDomainDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdd={handleAdd} serverPort={server?.java_port ?? 25565} />
    </>
  );
}

type DomainData = {
  id: number;
  domain: string;
  port: number | null;
  type: string;
  sslEnabled: boolean;
  sslExpiresAt: string | null;
};

const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  http: 'default',
  tcp: 'secondary',
};

function getSrvSubdomain(domain: string): string | null {
  const parts = domain.split('.');
  return parts.length > 2 ? parts[0] : null;
}

function getSrvProtocol(domain: string): string {
  const sub = getSrvSubdomain(domain);
  return sub ? `_tcp.${sub}` : '_tcp';
}

function DomainRow({
  domain,
  serverIp,
  onRemove,
  onEnableSsl,
}: {
  domain: DomainData;
  serverIp: string;
  onRemove: { mutateAsync: (id: number) => Promise<unknown>; isPending: boolean };
  onEnableSsl: { mutateAsync: (id: number) => Promise<unknown>; isPending: boolean };
}) {
  const { t } = useTranslation();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showDns, setShowDns] = useState(false);

  const isExpiringSoon = domain.sslExpiresAt && new Date(domain.sslExpiresAt).getTime() - Date.now() < 14 * 24 * 60 * 60 * 1000;

  const handleDelete = async () => {
    try {
      await onRemove.mutateAsync(domain.id);
      setDeleteConfirm(false);
    } catch {}
  };

  return (
    <FeatureCard.Stack className={'gap-y-0'}>
      <FeatureCard.Row interactive className={'items-center gap-8 py-3'}>
        <div className={'flex items-center gap-3'}>
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              domain.sslEnabled ? 'bg-green-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'
            )}
          >
            {domain.sslEnabled ? <Lock className={'size-4'} strokeWidth={2} /> : <Globe className={'size-4'} strokeWidth={2} />}
          </div>
          <div className={'min-w-0'}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{domain.domain}</span>
              <Badge variant={TYPE_BADGE_VARIANT[domain.type]} className={'font-medium uppercase'}>
                {domain.type}
              </Badge>
              {domain.sslEnabled ? (
                <Badge variant={isExpiringSoon ? 'outline' : 'default'} className={'font-medium'}>
                  {isExpiringSoon ? t('settings.domains.sslExpiringSoon') : 'SSL'}
                </Badge>
              ) : (
                <Badge variant={'secondary'} className={'font-medium'}>
                  {t('settings.domains.noSsl')}
                </Badge>
              )}
            </div>
            <div className={'mt-0.5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'font-jetbrains tabular-nums'}>:{domain.port}</span>
              {domain.sslExpiresAt && (
                <>
                  <span className={'text-zinc-200 dark:text-zinc-700'}>&middot;</span>
                  <span>{t('settings.domains.expiresAt', { date: new Date(domain.sslExpiresAt).toLocaleDateString() })}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <FeatureCard.RowControl>
          {deleteConfirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button
                onClick={handleDelete}
                variant={'destructive'}
                size={'xs'}
                disabled={onRemove.isPending}
                loading={onRemove.isPending}
              >
                {t('common.yes')}
              </Button>
              <Button onClick={() => setDeleteConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <>
              <TooltipProvider delayDuration={300}>
                {!domain.sslEnabled && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => onEnableSsl.mutateAsync(domain.id)} variant={'success'} size={'xs'}>
                        <Lock className={'size-3.5'} />
                        {t('settings.domains.enableSsl')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                      {t('settings.domains.enableSslTooltip')}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setShowDns(!showDns)}
                      variant={'ghost'}
                      size={'icon-sm'}
                      className={'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-400'}
                    >
                      <ShieldAlert className={'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                    {t('settings.domains.showDnsRecords')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={() => setDeleteConfirm(true)} variant={'ghost-destructive'} size={'icon-sm'}>
                      <Trash2 className={'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                    {t('settings.domains.removeDomain')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      {showDns && <DnsHelper domain={domain.domain} {...{ serverIp }} />}
    </FeatureCard.Stack>
  );
}

function DnsHelper({ domain, serverIp }: { domain: string; serverIp: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(serverIp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={'border-t border-black/6 px-5 py-4 dark:border-white/6'}>
      <div className={'text-sm font-medium text-zinc-600 dark:text-zinc-400'}>{t('settings.domains.dnsRecords')}</div>
      <div className={'mt-2 space-y-2'}>
        <div className={'rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-800/50'}>
          <div className={'flex items-center justify-between'}>
            <div className={'font-jetbrains text-sm'}>
              <span className={'text-zinc-500'}>A</span>
              <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
              <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{domain}</span>
              <span className={'mx-3 text-zinc-300 dark:text-zinc-600'}>&rarr;</span>
              <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{serverIp}</span>
            </div>
            <Button onClick={handleCopy} variant={'ghost'} size={'icon-sm'}>
              {copied ? <CheckCircle2 className={'size-3.5 text-green-600'} /> : <Copy className={'size-3.5'} />}
            </Button>
          </div>
        </div>
      </div>
      <p className={'mt-2 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.domains.dnsHint')}</p>
    </div>
  );
}
