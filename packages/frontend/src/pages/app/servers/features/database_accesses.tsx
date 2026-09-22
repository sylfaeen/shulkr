import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Globe, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { formatDate } from '@shulkr/frontend/lib/date';
import {
  useDatabaseAccesses,
  useRevealAccessCredentials,
  useRevokeDatabaseAccess,
  useRotateAccessPassword,
} from '@shulkr/frontend/hooks/use_databases';
import { CreateDatabaseAccessDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_database_access_dialog';
import { DatabaseCredentialsPanel, buildLaravelSnippet } from '@shulkr/frontend/pages/app/servers/features/database_credentials';
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
    <div className={'space-y-3 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800'}>
      <div className={'flex items-center justify-between gap-4'}>
        <div>
          <p className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{t('databases.access.title')}</p>
          <p className={'text-xs text-zinc-500 dark:text-zinc-400'}>{t('databases.access.description')}</p>
        </div>
        <Button size={'sm'} variant={'outline'} icon={Plus} onClick={() => setCreateOpen(true)}>
          {t('databases.access.add')}
        </Button>
      </div>
      {isLoading ? (
        <SkeletonList rows={2} className={'w-full'} />
      ) : accesses.length === 0 ? (
        <p className={'rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'}>
          {t('databases.access.empty')}
        </p>
      ) : (
        <div className={'space-y-2'}>
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
  const rotatePassword = useRotateAccessPassword(databaseId);
  const revokeAccess = useRevokeDatabaseAccess(databaseId, serverId);

  const isDormant = !access.lastUsedAt || Date.now() - new Date(access.lastUsedAt).getTime() > DORMANT_THRESHOLD_MS;

  const handleReveal = async () => {
    setCredentials(await revealCredentials.mutateAsync(access.id));
  };

  const handleRotate = async () => {
    setCredentials(await rotatePassword.mutateAsync(access.id));
  };

  return (
    <div className={'rounded-lg border border-zinc-200 p-3 dark:border-zinc-800'}>
      <div className={'flex flex-wrap items-center gap-2'}>
        <Globe className={'size-4 text-zinc-400'} />
        <span className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{access.label}</span>
        <Badge variant={access.scope === 'read' ? 'secondary' : 'default'}>
          {access.scope === 'read' ? t('databases.access.scopeRead') : t('databases.access.scopeWrite')}
        </Badge>
        <span className={'font-jetbrains text-xs text-zinc-500 dark:text-zinc-400'}>{access.allowedIp}</span>
        {access.requireCertificate && <Badge variant={'outline'}>{t('databases.access.certificateBadge')}</Badge>}
        {isDormant && <Badge variant={'warning'}>{t('databases.access.dormant')}</Badge>}
        <div className={'ml-auto flex items-center gap-1'}>
          <Button
            size={'sm'}
            variant={'ghost'}
            icon={Eye}
            onClick={() => setGateOpen(true)}
            loading={revealCredentials.isPending}
          />
          <Button size={'sm'} variant={'ghost'} icon={RefreshCw} onClick={handleRotate} loading={rotatePassword.isPending} />
          <Button
            size={'sm'}
            variant={'ghost'}
            icon={Trash2}
            iconClass={'text-red-500'}
            onClick={() => revokeAccess.mutateAsync(access.id)}
            loading={revokeAccess.isPending}
          />
        </div>
      </div>
      <p className={'mt-1 text-xs text-zinc-400 dark:text-zinc-500'}>
        {access.lastUsedAt
          ? t('databases.access.lastActivity', { date: formatDate(access.lastUsedAt) })
          : t('databases.access.noActivity')}
      </p>
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
