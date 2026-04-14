import { useState, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Check, Copy, FolderOpen, HardDrive, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useSftpInfo, useSftpAccounts, useDeleteSftpAccount } from '@shulkr/frontend/hooks/use_sftp';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { CreateSftpAccountDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_sftp_account_dialog';
import { EditSftpAccountDialog } from '@shulkr/frontend/pages/app/servers/dialogs/edit_sftp_account_dialog';
import type { SftpAccountResponse } from '@shulkr/shared';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerSettingsSftpPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsSftp')}` : t('nav.settingsSftp'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={HardDrive} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('settings.sftp.title')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/configuration'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('settings.sftp.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <ConnectionInfoSection />
          <AccountsSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function ConnectionInfoSection() {
  const { t } = useTranslation();
  const { data: sftpInfo } = useSftpInfo();

  const fields = [
    { label: t('settings.sftp.connectionInfo.host'), value: sftpInfo?.host ?? '—' },
    { label: t('settings.sftp.connectionInfo.sftpPort'), value: String(sftpInfo?.port ?? '—') },
  ];

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('settings.sftp.connectionInfo.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('settings.sftp.connectionInfo.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        <div className={'grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-black/5 sm:grid-cols-2 dark:bg-white/5'}>
          {fields.map((field) => (
            <ConnectionInfoCell key={field.label} {...field} />
          ))}
        </div>
      </FeatureCard.Body>
    </FeatureCard>
  );
}

function ConnectionInfoCell({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <button
      type={'button'}
      onClick={handleCopy}
      className={
        'group flex flex-col gap-1 bg-white px-5 py-3.5 text-left transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80'
      }
    >
      <span className={'text-xs font-medium text-zinc-400 dark:text-zinc-500'}>{label}</span>
      <span className={'flex items-center gap-2'}>
        <span className={'font-jetbrains text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{value}</span>
        {copied ? (
          <Check className={'size-3 text-green-500'} strokeWidth={3} />
        ) : (
          <Copy
            className={
              'size-3 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400'
            }
          />
        )}
      </span>
    </button>
  );
}

function AccountsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canCreate = can('server:sftp:create');

  const [createGateOpen, setCreateGateOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SftpAccountResponse | null>(null);

  const { data: accountsData } = useSftpAccounts(serverId);
  const deleteSftpAccount = useDeleteSftpAccount(serverId);

  const accounts: Array<SftpAccountResponse> = accountsData?.accounts ?? [];

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={accounts.length > 0 && accounts.length}>
              {t('settings.sftp.accounts.title')}
            </FeatureCard.Title>
            <FeatureCard.Description>{t('settings.sftp.accounts.description')}</FeatureCard.Description>
          </FeatureCard.Content>
          {canCreate && (
            <FeatureCard.Actions>
              <Button onClick={() => setCreateGateOpen(true)}>
                <Plus className={'size-4'} />
                {t('settings.sftp.accounts.addAccount')}
              </Button>
            </FeatureCard.Actions>
          )}
        </FeatureCard.Header>
        <FeatureCard.Body>
          {accounts.length === 0 ? (
            <FeatureCard.Empty
              icon={Upload}
              title={t('settings.sftp.accounts.noAccounts')}
              description={t('settings.sftp.accounts.noAccountsHint')}
            />
          ) : (
            <>
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  onEdit={() => setEditingAccount(account)}
                  onDelete={() => deleteSftpAccount.mutateAsync(account.id)}
                  {...{ account }}
                />
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <PasswordGate
        open={createGateOpen}
        onOpenChange={setCreateGateOpen}
        title={t('settings.sftp.accounts.addAccount')}
        description={t('settings.sftp.accounts.description')}
        onConfirm={() => setCreateDialogOpen(true)}
      />
      <CreateSftpAccountDialog open={createDialogOpen} onOpenChange={() => setCreateDialogOpen(false)} {...{ serverId }} />
      {editingAccount && (
        <EditSftpAccountDialog
          open={true}
          onOpenChange={() => setEditingAccount(null)}
          account={editingAccount}
          {...{ serverId }}
        />
      )}
    </>
  );
}

function AccountRow({
  account,
  onEdit,
  onDelete,
}: {
  account: SftpAccountResponse;
  onEdit: () => void;
  onDelete: () => void | Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [deleteGateOpen, setDeleteGateOpen] = useState(false);

  const can = useHasPermission();
  const canUpdate = can('server:sftp:update');
  const canDelete = can('server:sftp:delete');

  const isReadOnly = account.permissions === 'read-only';
  const pathsLabel = account.allowedPaths.length === 0 ? t('settings.sftp.accounts.allFolders') : account.allowedPaths.join(', ');

  return (
    <>
      <FeatureCard.Row interactive className={'items-center py-3'}>
        <div className={'flex items-center gap-3'}>
          <div className={'flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white'}>
            <FolderOpen className={'size-4'} strokeWidth={2} />
          </div>
          <div className={'min-w-0'}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-semibold text-zinc-800 dark:text-zinc-200'}>{account.username}</span>
              <Badge>{isReadOnly ? t('settings.sftp.accounts.readOnly') : t('settings.sftp.accounts.readWrite')}</Badge>
            </div>
            <div className={'mt-0.5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span>{pathsLabel}</span>
              <span className={'text-zinc-200 dark:text-zinc-700'}>&middot;</span>
              <span>{t('settings.sftp.accounts.createdAt', { date: new Date(account.createdAt).toLocaleDateString() })}</span>
            </div>
          </div>
        </div>
        <FeatureCard.RowControl>
          {canUpdate && (
            <Button onClick={onEdit} variant={'ghost'} size={'icon-sm'}>
              <Pencil className={'size-4'} />
            </Button>
          )}
          {canDelete && (
            <Button onClick={() => setDeleteGateOpen(true)} variant={'ghost-destructive'} size={'icon-sm'}>
              <Trash2 className={'size-4'} />
            </Button>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      <PasswordGate
        open={deleteGateOpen}
        onOpenChange={setDeleteGateOpen}
        title={t('settings.sftp.accounts.title')}
        description={account.username}
        onConfirm={async () => {
          await onDelete();
        }}
        destructive
      />
    </>
  );
}
