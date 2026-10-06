import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, FileKey, Globe, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { formatDate } from '@shulkr/frontend/lib/date';
import {
  useDatabaseAccesses,
  useDownloadCaCertificate,
  useReissueAccessCertificate,
  useRevealAccessCredentials,
  useRevokeDatabaseAccess,
  useRotateAccessPassword,
} from '@shulkr/frontend/hooks/use_databases';
import { CreateDatabaseAccessDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_database_access_dialog';
import {
  ClientCertificateBlock,
  DatabaseCredentialsPanel,
  buildLaravelSnippet,
} from '@shulkr/frontend/pages/app/servers/features/database_credentials';
import type { DatabaseAccessCredentials, DatabaseAccessResponse } from '@shulkr/shared';

// Thirty days without an observed connection. An IP changes hands: a residential address gets reassigned, a destroyed VPS returns its own to the provider pool.
const DORMANT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

export function DatabaseAccesses({
  databaseId,
  serverId,
  remoteEnabled,
}: {
  databaseId: number;
  serverId: string;
  remoteEnabled: boolean;
}) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useDatabaseAccesses(databaseId, true);
  const accesses: Array<DatabaseAccessResponse> = data?.accesses ?? [];

  return (
    <div className={'border-border/60 border-t px-5 py-3'}>
      <div className={'flex items-center justify-between gap-4'}>
        <p className={'text-xs text-zinc-500 dark:text-zinc-400'}>{t('databases.access.title')}</p>
        <Button size={'sm'} variant={'ghost'} icon={Plus} className={'h-7 px-2 text-xs'} onClick={() => setCreateOpen(true)}>
          {t('databases.access.add')}
        </Button>
      </div>
      {isLoading ? (
        <SkeletonList rows={1} className={'mt-2 w-full'} />
      ) : accesses.length === 0 ? (
        <p className={'mt-1 text-xs text-zinc-500 dark:text-zinc-400'}>{t('databases.access.empty')}</p>
      ) : (
        <div className={'mt-2 space-y-2'}>
          {accesses.map((access) => (
            <AccessRow key={access.id} {...{ access, databaseId, serverId }} />
          ))}
        </div>
      )}
      <CreateDatabaseAccessDialog
        open={createOpen}
        onOpenChange={() => setCreateOpen(false)}
        isFirstRemoteAccess={!remoteEnabled}
        {...{ databaseId, serverId }}
      />
    </div>
  );
}

function AccessRow({ access, databaseId, serverId }: { access: DatabaseAccessResponse; databaseId: number; serverId: string }) {
  const { t } = useTranslation();
  const [gateOpen, setGateOpen] = useState(false);
  const [credentials, setCredentials] = useState<DatabaseAccessCredentials | null>(null);
  const revealCredentials = useRevealAccessCredentials(databaseId);
  const downloadCa = useDownloadCaCertificate();
  const reissueCertificate = useReissueAccessCertificate(databaseId);
  const [certificate, setCertificate] = useState<{ clientCertificate: string; clientKey: string; password: string } | null>(null);
  const rotatePassword = useRotateAccessPassword(databaseId);
  const revokeAccess = useRevokeDatabaseAccess(databaseId, serverId);
  const isDormant = !access.lastUsedAt || Date.now() - new Date(access.lastUsedAt).getTime() > DORMANT_THRESHOLD_MS;

  const handleReveal = async () => {
    setCredentials(await revealCredentials.mutateAsync(access.id));
  };

  const handleReissue = async () => {
    const result = await reissueCertificate.mutateAsync(access.id);
    setCertificate(result);
    setCredentials(null);
  };

  const handleRotate = async () => {
    setCredentials(await rotatePassword.mutateAsync(access.id));
  };

  return (
    <div className={'border-border/70 bg-muted/30 rounded-lg border p-3'}>
      <div className={'flex flex-wrap items-center gap-2'}>
        <Globe className={'size-4 text-zinc-400'} />
        <span className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{access.label}</span>
        <Badge variant={access.scope === 'read' ? 'secondary' : 'default'}>
          {access.scope === 'read' ? t('databases.access.scopeRead') : t('databases.access.scopeWrite')}
        </Badge>
        <span className={'font-jetbrains text-xs text-zinc-500 dark:text-zinc-400'}>{access.allowedIp}</span>
        {access.requireCertificate && <Badge variant={'outline'}>{t('databases.access.certificateBadge')}</Badge>}
        {isDormant && <Badge variant={'warning'}>{t('databases.access.dormant')}</Badge>}
        <TooltipProvider delay={300}>
          <div className={'ml-auto flex items-center gap-1'}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size={'sm'}
                    variant={'ghost'}
                    icon={Eye}
                    aria-label={t('databases.access.actions.reveal')}
                    onClick={() => setGateOpen(true)}
                  />
                }
              />
              <TooltipContent>{t('databases.access.actions.reveal')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size={'sm'}
                    variant={'ghost'}
                    icon={FileKey}
                    aria-label={t('databases.access.actions.downloadCa')}
                    onClick={downloadCa}
                  />
                }
              />
              <TooltipContent>{t('databases.access.actions.downloadCa')}</TooltipContent>
            </Tooltip>
            {access.requireCertificate && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size={'sm'}
                      variant={'ghost'}
                      icon={ShieldCheck}
                      aria-label={t('databases.access.actions.reissueCertificate')}
                      onClick={handleReissue}
                      loading={reissueCertificate.isPending}
                    />
                  }
                />
                <TooltipContent>{t('databases.access.actions.reissueCertificate')}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size={'sm'}
                    variant={'ghost'}
                    icon={RefreshCw}
                    aria-label={t('databases.access.actions.rotate')}
                    onClick={handleRotate}
                  />
                }
              />
              <TooltipContent>{t('databases.access.actions.rotate')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size={'sm'}
                    variant={'ghost'}
                    icon={Trash2}
                    iconClass={'text-red-500'}
                    aria-label={t('databases.access.actions.revoke')}
                    onClick={() => revokeAccess.mutateAsync(access.id)}
                  />
                }
              />
              <TooltipContent>{t('databases.access.actions.revoke')}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
      <p className={'mt-1 text-xs text-zinc-400 dark:text-zinc-500'}>
        {access.lastUsedAt
          ? t('databases.access.lastActivity', { date: formatDate(access.lastUsedAt) })
          : t('databases.access.noActivity')}
      </p>
      {certificate && (
        <div className={'mt-3 space-y-2'}>
          <ClientCertificateBlock certificate={certificate.clientCertificate} privateKey={certificate.clientKey} />
          <p className={'text-xs text-amber-700 dark:text-amber-500'}>{t('databases.access.reissueRotatedPassword')}</p>
        </div>
      )}
      {credentials && (
        <div className={'mt-3'}>
          <DatabaseCredentialsPanel
            credentials={credentials}
            snippet={{
              label: t('databases.access.laravelSnippet'),
              content: buildLaravelSnippet(credentials, access.requireCertificate),
            }}
          />
        </div>
      )}
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        scope={'database-credentials'}
        title={t('databases.reveal.title')}
        description={t('databases.reveal.description')}
        onConfirm={handleReveal}
      />
    </div>
  );
}
