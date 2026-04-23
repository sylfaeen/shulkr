import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, CloudDownload, Plug, Power, PowerOff, RefreshCw } from 'lucide-react';
import type { AgentPlatform, AgentStatus } from '@shulkr/shared';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { cn } from '@shulkr/frontend/lib/cn';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import {
  useAgentConfig,
  useAgentStatus,
  useDisableAgent,
  useEnableAgent,
  useInstallAgent,
  useRegenerateAgentToken,
  useUpdateAgent,
} from '@shulkr/frontend/hooks/use_agent';
import { InstallAgentDialog } from '@shulkr/frontend/pages/app/servers/dialogs/install_agent_dialog';

type ConfirmKind = 'regenerate' | 'disable' | 'downgrade' | null;
type AgentPhase = 'loading' | 'notInstalled' | 'pending' | 'connected' | 'disconnected' | 'outdated' | 'disabled';

type PlatformAccent = {
  label: string;
  dot: string;
};

const PLATFORM_ACCENTS: Record<AgentPlatform, PlatformAccent> = {
  paper: { label: 'Paper', dot: 'bg-emerald-500' },
  folia: { label: 'Folia', dot: 'bg-violet-500' },
  velocity: { label: 'Velocity', dot: 'bg-sky-500' },
  waterfall: { label: 'Waterfall', dot: 'bg-amber-500' },
};

function derivePhase(status: AgentStatus | undefined, isLoading: boolean): AgentPhase {
  if (isLoading) return 'loading';
  if (!status) return 'notInstalled';
  if (!status.enabled && status.installed) return 'disabled';
  if (!status.enabled && !status.installed) return 'notInstalled';
  if (status.enabled && !status.installed) return 'pending';
  if (status.enabled && status.connected && status.version_mismatch) return 'outdated';
  if (status.enabled && status.connected) return 'connected';
  return 'disconnected';
}

export function AgentSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canManage = can('server:agents:manage');
  const { data: status, isLoading } = useAgentStatus(serverId);
  const hasConfigOnDisk = !!status && (status.installed || status.enabled);
  const { data: config } = useAgentConfig(serverId, hasConfigOnDisk);
  const enableMutation = useEnableAgent(serverId);
  const disableMutation = useDisableAgent(serverId);
  const regenerateMutation = useRegenerateAgentToken(serverId);
  const installMutation = useInstallAgent(serverId);
  const updateMutation = useUpdateAgent(serverId);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const isBusy =
    enableMutation.isPending ||
    disableMutation.isPending ||
    regenerateMutation.isPending ||
    installMutation.isPending ||
    updateMutation.isPending;
  const phase = derivePhase(status, isLoading);
  const accent = status?.platform ? PLATFORM_ACCENTS[status.platform] : null;
  const isInstalledPhase = phase !== 'notInstalled' && phase !== 'loading';
  const showManagementActions = phase === 'connected' || phase === 'outdated' || phase === 'pending' || phase === 'disconnected';
  const showFooter = canManage && (showManagementActions || phase === 'disabled');
  const onConfirmAction = () => {
    if (confirm === 'regenerate') regenerateMutation.mutate();
    else if (confirm === 'disable') disableMutation.mutate();
    else if (confirm === 'downgrade') updateMutation.mutate(status?.platform ?? 'paper');
    setConfirm(null);
  };
  const handleInstall = (chosen: AgentPlatform) => {
    installMutation.mutate(chosen, { onSettled: () => setInstallOpen(false) });
  };
  const handleReinstall = () => {
    if (status?.platform) installMutation.mutate(status.platform);
    else setInstallOpen(true);
  };
  const handleUpdate = () => {
    if (!status?.platform) return;
    const pv = status.plugin_version ?? '';
    const ev = status.expected_version ?? '';
    if (pv && ev && pv.localeCompare(ev, undefined, { numeric: true }) > 0) setConfirm('downgrade');
    else updateMutation.mutate(status.platform);
  };
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('agent.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('agent.description')}</FeatureCard.Description>
        </FeatureCard.Content>
        <FeatureCard.Actions>
          <StatusBadge {...{ phase }} />
        </FeatureCard.Actions>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {phase === 'notInstalled' && (
          <FeatureCard.Empty icon={Plug} title={t('agent.notInstalledTitle')} description={t('agent.notInstalledBody')}>
            {canManage && (
              <Button
                onClick={() => setInstallOpen(true)}
                loading={installMutation.isPending}
                disabled={isBusy}
                icon={CloudDownload}
              >
                {t('agent.installButton')}
              </Button>
            )}
          </FeatureCard.Empty>
        )}
        {isInstalledPhase && status && (
          <FeatureCard.Row layout={'column'} className={'gap-3 py-4'}>
            {phase === 'pending' && (
              <Alert variant={'warning'} className={'w-full'}>
                <Plug className={'size-4'} />
                <AlertDescription>{t('agent.pendingHint')}</AlertDescription>
              </Alert>
            )}
            {phase === 'outdated' && (
              <Alert variant={'warning'} className={'w-full'}>
                <ArrowUpCircle className={'size-4'} />
                <AlertDescription>
                  {t('agent.outdatedHint', {
                    detected: status.plugin_version ?? '?',
                    expected: status.expected_version ?? '?',
                  })}
                </AlertDescription>
              </Alert>
            )}
            {config && !config.exists && (
              <Alert variant={'destructive'} className={'w-full'}>
                <Plug className={'size-4'} />
                <AlertDescription>
                  <span className={'block'}>{t('agent.configMissing')}</span>
                  <span className={'font-jetbrains mt-0.5 block text-xs opacity-70'}>{config.path}</span>
                </AlertDescription>
              </Alert>
            )}
            <div className={'grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2'}>
              <MetaRow label={t('agent.platform')} value={<PlatformValue accent={accent} status={status} />} />
              <MetaRow label={t('agent.version')} value={status.plugin_version ?? '-'} />
              <MetaRow label={t('agent.expectedVersion')} value={status.expected_version} />
              <MetaRow label={t('agent.lastSeen')} value={<LastSeenValue phase={phase} lastSeenAt={status.last_seen_at} />} />
              <MetaRow label={t('agent.tokenPreview')} value={status.token_preview ? `${status.token_preview}…` : '-'} />
              <MetaRow label={t('agent.configBackendUrl')} value={config?.backend_url ?? '-'} />
              <MetaRow label={t('agent.configServerId')} value={config?.server_id ?? '-'} />
              <MetaRow
                label={t('agent.configPushInterval')}
                value={config?.push_interval_seconds != null ? t('agent.seconds', { count: config.push_interval_seconds }) : '-'}
              />
              <MetaRow label={t('agent.configProtocolVersion')} value={config?.protocol_version?.toString() ?? '-'} />
              <MetaRow label={t('agent.configPath')} value={config?.path ?? '-'} />
            </div>
          </FeatureCard.Row>
        )}
      </FeatureCard.Body>
      {showFooter && (
        <FeatureCard.Footer>
          <div className={'flex flex-wrap items-center justify-end gap-2'}>
            {phase === 'disabled' && (
              <Button
                size={'sm'}
                onClick={() => enableMutation.mutate()}
                loading={enableMutation.isPending}
                disabled={isBusy}
                icon={Power}
              >
                {t('agent.enable')}
              </Button>
            )}
            {phase === 'outdated' && (
              <Button
                size={'sm'}
                onClick={handleUpdate}
                loading={updateMutation.isPending}
                disabled={isBusy}
                icon={ArrowUpCircle}
              >
                {t('agent.update')}
              </Button>
            )}
            {showManagementActions && (
              <>
                <Button
                  variant={'secondary'}
                  size={'sm'}
                  onClick={handleReinstall}
                  loading={installMutation.isPending}
                  disabled={isBusy}
                  icon={CloudDownload}
                >
                  {t('agent.reinstall')}
                </Button>
                <Button
                  variant={'secondary'}
                  size={'sm'}
                  onClick={() => setConfirm('regenerate')}
                  disabled={isBusy}
                  icon={RefreshCw}
                >
                  {t('agent.regenerateToken')}
                </Button>
                <Button
                  variant={'ghost-destructive'}
                  size={'sm'}
                  onClick={() => setConfirm('disable')}
                  disabled={isBusy}
                  icon={PowerOff}
                >
                  {t('agent.disable')}
                </Button>
              </>
            )}
          </div>
        </FeatureCard.Footer>
      )}
      <ConfirmDialog kind={confirm} onCancel={() => setConfirm(null)} onConfirm={onConfirmAction} />
      <InstallAgentDialog
        open={installOpen}
        isPending={installMutation.isPending}
        onClose={() => setInstallOpen(false)}
        onConfirm={handleInstall}
        currentPlatform={status?.platform ?? null}
      />
    </FeatureCard>
  );
}

function PlatformValue({ accent, status }: { accent: PlatformAccent | null; status: AgentStatus }) {
  const { t } = useTranslation();
  const label = accent ? accent.label : t('agent.platform');
  const version = status.platform_version ?? '';
  if (!accent) return <span>{`${label}${version ? ` ${version}` : ''}`}</span>;
  return (
    <span className={'inline-flex items-center gap-2'}>
      <span className={cn('inline-block size-2 shrink-0 rounded-full', accent.dot)} />
      <span className={'truncate'}>{`${label}${version ? ` ${version}` : ''}`}</span>
    </span>
  );
}

function LastSeenValue({ phase, lastSeenAt }: { phase: AgentPhase; lastSeenAt: string | null }) {
  const { t } = useTranslation();
  const dotClass =
    phase === 'connected'
      ? 'bg-emerald-500'
      : phase === 'pending' || phase === 'outdated'
        ? 'bg-amber-500'
        : phase === 'disabled'
          ? 'bg-zinc-400 dark:bg-zinc-500'
          : 'bg-red-500';
  return (
    <span className={'inline-flex items-center gap-2'}>
      <span className={'relative inline-flex size-1.5'}>
        {phase === 'connected' && (
          <span
            className={cn('absolute inline-flex size-full rounded-full opacity-60', dotClass)}
            style={{ animation: 'agent-dot-pulse 1.8s ease-out infinite' }}
          />
        )}
        <span className={cn('relative inline-flex size-1.5 rounded-full', dotClass)} />
      </span>
      <span className={'truncate'}>{formatRelative(lastSeenAt, t)}</span>
    </span>
  );
}

function StatusBadge({ phase }: { phase: AgentPhase }) {
  const { t } = useTranslation();
  if (phase === 'loading') return null;
  if (phase === 'disabled') return <Badge variant={'outline'}>{t('agent.status.disabled')}</Badge>;
  if (phase === 'notInstalled') return <Badge variant={'outline'}>{t('agent.status.notInstalled')}</Badge>;
  if (phase === 'outdated')
    return <Badge className={cn('bg-amber-500/20 text-amber-700 dark:text-amber-300')}>{t('agent.status.outdated')}</Badge>;
  if (phase === 'connected')
    return (
      <Badge className={cn('bg-emerald-500/20 text-emerald-700 dark:text-emerald-300')}>{t('agent.status.connected')}</Badge>
    );
  if (phase === 'pending')
    return <Badge className={cn('bg-amber-500/20 text-amber-700 dark:text-amber-300')}>{t('agent.status.pending')}</Badge>;
  return <Badge variant={'destructive'}>{t('agent.status.disconnected')}</Badge>;
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className={
        'flex min-w-0 items-baseline justify-between gap-3 border-b border-black/5 pb-1.5 last:border-b-0 dark:border-white/5'
      }
    >
      <span className={'shrink-0 text-xs text-zinc-500 dark:text-zinc-400'}>{label}</span>
      <span className={'font-jetbrains min-w-0 truncate text-sm text-zinc-800 dark:text-zinc-200'}>{value}</span>
    </div>
  );
}

function ConfirmDialog({ kind, onCancel, onConfirm }: { kind: ConfirmKind; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const open = kind !== null;
  const title =
    kind === 'regenerate'
      ? t('agent.confirm.regenerateTitle')
      : kind === 'disable'
        ? t('agent.confirm.disableTitle')
        : kind === 'downgrade'
          ? t('agent.confirm.downgradeTitle')
          : '';
  const description =
    kind === 'regenerate'
      ? t('agent.confirm.regenerateDescription')
      : kind === 'disable'
        ? t('agent.confirm.disableDescription')
        : kind === 'downgrade'
          ? t('agent.confirm.downgradeDescription')
          : '';
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant={'ghost'} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={kind === 'disable' ? 'destructive' : 'default'} onClick={onConfirm}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatRelative(iso: string | null, t: ReturnType<typeof useTranslation>['t']): string {
  if (!iso) return '-';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '-';
  const diff = Date.now() - ts;
  if (diff < 10_000) return t('agent.justNow');
  if (diff < 60_000) return t('agent.secondsAgo', { count: Math.round(diff / 1000) });
  if (diff < 3_600_000) return t('agent.minutesAgo', { count: Math.round(diff / 60_000) });
  if (diff < 86_400_000) return t('agent.hoursAgo', { count: Math.round(diff / 3_600_000) });
  return t('agent.daysAgo', { count: Math.round(diff / 86_400_000) });
}
