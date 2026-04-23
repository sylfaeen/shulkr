import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, Plug, RefreshCw, Power, PowerOff, ArrowUpCircle } from 'lucide-react';
import type { AgentPlatform } from '@shulkr/shared';
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
  useAgentStatus,
  useEnableAgent,
  useDisableAgent,
  useRegenerateAgentToken,
  useInstallAgent,
  useUpdateAgent,
} from '@shulkr/frontend/hooks/use_agent';
import { InstallAgentDialog } from '@shulkr/frontend/pages/app/servers/dialogs/install_agent_dialog';

type ConfirmKind = 'regenerate' | 'disable' | 'downgrade' | null;

export function AgentSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canManage = can('server:agents:manage');
  const { data: status, isLoading } = useAgentStatus(serverId);
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

  const onConfirmAction = () => {
    if (confirm === 'regenerate') regenerateMutation.mutate();
    else if (confirm === 'disable') disableMutation.mutate();
    else if (confirm === 'downgrade') {
      const platform = status?.platform ?? 'paper';
      updateMutation.mutate(platform);
    }
    setConfirm(null);
  };
  const handleInstall = (platform: AgentPlatform) => {
    installMutation.mutate(platform, {
      onSettled: () => setInstallOpen(false),
    });
  };
  const handleReinstall = () => {
    if (status?.platform) installMutation.mutate(status.platform);
    else setInstallOpen(true);
  };
  const handleUpdate = () => {
    if (status?.platform) updateMutation.mutate(status.platform);
  };

  const notInstalled = !status?.enabled && !status?.installed;
  const pending = status?.enabled && !status?.installed;
  const connected = status?.enabled && status?.connected;
  const disconnected = status?.enabled && status?.installed && !status?.connected;
  const outdated = connected && status?.version_mismatch === true;

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('agent.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('agent.description')}</FeatureCard.Description>
        </FeatureCard.Content>
        <FeatureCard.Actions>
          <AgentStatusBadge
            {...{ isLoading, notInstalled, pending, connected, disconnected, outdated, status: status ?? null }}
          />
        </FeatureCard.Actions>
      </FeatureCard.Header>
      <FeatureCard.Body className={'space-y-3 p-4'}>
        {notInstalled && (
          <Alert>
            <Plug className={'size-4'} />
            <AlertDescription>{t('agent.notInstalledHint')}</AlertDescription>
          </Alert>
        )}
        {pending && (
          <Alert variant={'warning'}>
            <Plug className={'size-4'} />
            <AlertDescription>{t('agent.pendingHint')}</AlertDescription>
          </Alert>
        )}
        {outdated && (
          <Alert variant={'warning'}>
            <ArrowUpCircle className={'size-4'} />
            <AlertDescription>
              {t('agent.outdatedHint', { detected: status?.plugin_version ?? '?', expected: status?.expected_version ?? '?' })}
            </AlertDescription>
          </Alert>
        )}
        {status && (status.enabled || status.installed) && (
          <div className={'grid grid-cols-1 gap-2 text-sm sm:grid-cols-2'}>
            <MetaRow
              label={t('agent.platform')}
              value={
                status.platform ? `${t(`agent.platforms.${status.platform}.name`)} ${status.platform_version ?? ''}`.trim() : '—'
              }
            />
            <MetaRow label={t('agent.version')} value={status.plugin_version ?? '—'} />
            <MetaRow label={t('agent.expectedVersion')} value={status.expected_version} />
            <MetaRow label={t('agent.lastSeen')} value={formatRelative(status.last_seen_at, t)} />
            <MetaRow label={t('agent.tokenPreview')} value={status.token_preview ? `${status.token_preview}…` : '—'} />
          </div>
        )}
        {canManage && (
          <div className={'flex flex-wrap items-center justify-end gap-2'}>
            {notInstalled && (
              <Button onClick={() => setInstallOpen(true)} disabled={isBusy} icon={CloudDownload}>
                {t('agent.installButton')}
              </Button>
            )}
            {status?.enabled && (status.installed || pending) && (
              <>
                {outdated && (
                  <Button
                    variant={'secondary'}
                    onClick={() => {
                      const pv = status?.plugin_version ?? '';
                      const ev = status?.expected_version ?? '';
                      if (pv && ev && pv.localeCompare(ev, undefined, { numeric: true }) > 0) {
                        setConfirm('downgrade');
                      } else {
                        handleUpdate();
                      }
                    }}
                    loading={updateMutation.isPending}
                    disabled={isBusy}
                    icon={ArrowUpCircle}
                  >
                    {t('agent.update')}
                  </Button>
                )}
                <Button
                  variant={'secondary'}
                  onClick={handleReinstall}
                  loading={installMutation.isPending}
                  disabled={isBusy}
                  icon={CloudDownload}
                >
                  {t('agent.reinstall')}
                </Button>
                <Button variant={'secondary'} onClick={() => setConfirm('regenerate')} disabled={isBusy} icon={RefreshCw}>
                  {t('agent.regenerateToken')}
                </Button>
                <Button variant={'ghost-destructive'} onClick={() => setConfirm('disable')} disabled={isBusy} icon={PowerOff}>
                  {t('agent.disable')}
                </Button>
              </>
            )}
            {status && !status.enabled && status.installed && (
              <Button onClick={() => enableMutation.mutate()} loading={enableMutation.isPending} disabled={isBusy} icon={Power}>
                {t('agent.enable')}
              </Button>
            )}
          </div>
        )}
      </FeatureCard.Body>
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex items-baseline gap-2'}>
      <span className={'text-xs text-zinc-500 dark:text-zinc-400'}>{label}</span>
      <span className={'font-jetbrains text-sm text-zinc-800 dark:text-zinc-200'}>{value}</span>
    </div>
  );
}

function AgentStatusBadge({
  isLoading,
  notInstalled,
  pending,
  connected,
  disconnected,
  outdated,
  status,
}: {
  isLoading: boolean;
  notInstalled: boolean | undefined;
  pending: boolean | undefined;
  connected: boolean | undefined;
  disconnected: boolean | undefined;
  outdated: boolean | undefined;
  status: { enabled: boolean; installed: boolean } | null;
}) {
  const { t } = useTranslation();
  if (isLoading) return null;
  if (status && !status.enabled && status.installed) {
    return <Badge variant={'outline'}>{t('agent.status.disabled')}</Badge>;
  }
  if (notInstalled) return <Badge variant={'outline'}>{t('agent.status.notInstalled')}</Badge>;
  if (outdated)
    return <Badge className={cn('bg-amber-500/20 text-amber-700 dark:text-amber-300')}>{t('agent.status.outdated')}</Badge>;
  if (connected)
    return (
      <Badge className={cn('bg-emerald-500/20 text-emerald-700 dark:text-emerald-300')}>{t('agent.status.connected')}</Badge>
    );
  if (pending)
    return <Badge className={cn('bg-amber-500/20 text-amber-700 dark:text-amber-300')}>{t('agent.status.pending')}</Badge>;
  if (disconnected) return <Badge variant={'destructive'}>{t('agent.status.disconnected')}</Badge>;
  return null;
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
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 10_000) return t('agent.justNow');
  if (diff < 60_000) return t('agent.secondsAgo', { count: Math.round(diff / 1000) });
  if (diff < 3_600_000) return t('agent.minutesAgo', { count: Math.round(diff / 60_000) });
  if (diff < 86_400_000) return t('agent.hoursAgo', { count: Math.round(diff / 3_600_000) });
  return t('agent.daysAgo', { count: Math.round(diff / 86_400_000) });
}
