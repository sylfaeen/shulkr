import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Users, Plus, Crown, Shield, ChevronRight } from 'lucide-react';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useUsers, useCreateUser } from '@shulkr/frontend/hooks/use_users';
import { CreateUserDialog } from '@shulkr/frontend/pages/app/users/dialogs/create_user_dialog';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ApiError } from '@shulkr/frontend/lib/api';
import { DocsLink } from '@shulkr/frontend/pages/app/features/docs_link';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import type { UserResponse } from '@shulkr/shared';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';

export function UsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const can = useHasPermission();
  const canCreate = can('users:manage:create');

  usePageTitle('shulkr • ' + t('users.title'));

  const { data: users, isLoading, error } = useUsers();

  const currentUser = useAuthStore((state) => state.user);

  const createUser = useCreateUser();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = () => {
    setFormError(null);
    setShowCreateDialog(true);
  };

  const handleCreateSubmit = async (data: { username: string; password: string; permissions: Array<string> }) => {
    setFormError(null);
    try {
      await createUser.mutateAsync(data);
      setShowCreateDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t('errors.generic'));
      }
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (error) {
    return <PageError message={t('errors.generic')} />;
  }

  return (
    <PageContent>
      <div className={'space-y-6'}>
        <div className={'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
          <div>
            <div className={'flex items-center gap-2'}>
              <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>{t('users.title')}</h1>
              <DocsLink path={'/guide/users'} />
            </div>
            <p className={'mt-1 text-zinc-600 dark:text-zinc-400'}>{t('users.subtitle')}</p>
          </div>
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className={'size-4'} />
              {t('users.addUser')}
            </Button>
          )}
        </div>
        <div className={'overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900'}>
          <div className={'divide-y divide-black/4 dark:divide-white/6'}>
            {users?.map((user) => (
              <UserRow
                key={user.id}
                currentUserId={currentUser?.id}
                onEdit={() => navigate({ to: '/app/users/$id', params: { id: String(user.id) } }).then()}
                {...{ user }}
              />
            ))}
            {users?.length === 0 && <EmptyState onCreate={handleCreate} />}
          </div>
        </div>
        {showCreateDialog && (
          <CreateUserDialog
            onSubmit={handleCreateSubmit}
            onCancel={() => setShowCreateDialog(false)}
            isLoading={createUser.isPending}
            error={formError}
          />
        )}
      </div>
    </PageContent>
  );
}

type UserRowProps = {
  user: UserResponse;
  currentUserId: number | undefined;
  onEdit: () => void;
};

function UserRow({ user, currentUserId, onEdit }: UserRowProps) {
  const { t } = useTranslation();
  const isAdmin = user.permissions.includes('*');
  const permissionCount = user.permissions.filter((p) => p !== '*').length;

  return (
    <div
      onClick={onEdit}
      className={
        'group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-black/2 dark:hover:bg-white/2'
      }
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          isAdmin ? 'bg-amber-500/10' : 'bg-green-600/10'
        )}
      >
        {isAdmin ? (
          <Crown className={'size-4 text-amber-500'} strokeWidth={2} />
        ) : (
          <Shield className={'size-4 text-green-600'} strokeWidth={2} />
        )}
      </div>
      <div className={'min-w-0 flex-1'}>
        <div className={'flex items-center gap-2'}>
          <span className={'font-semibold text-zinc-900 dark:text-zinc-100'}>{user.username}</span>
          {isAdmin && (
            <Badge variant={'outline'} size={'xs'}>
              {t('users.admin')}
            </Badge>
          )}
          {user.id === currentUserId && (
            <Badge variant={'secondary'} size={'xs'}>
              {t('users.you')}
            </Badge>
          )}
        </div>
        <span className={'text-sm text-zinc-500 dark:text-zinc-400'}>
          {isAdmin ? t('users.allPermissions') : t('users.permissionCount', { count: permissionCount })}
        </span>
      </div>
      <ChevronRight
        className={'size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600'}
      />
    </div>
  );
}

type EmptyStateProps = {
  onCreate: () => void;
};

function EmptyState({ onCreate }: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className={'p-12 text-center'}>
      <div className={'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600/10'}>
        <Users className={'size-8 text-green-600'} strokeWidth={1.5} />
      </div>
      <h3 className={'mb-2 font-semibold text-zinc-900 dark:text-zinc-100'}>{t('users.noUsers')}</h3>
      <p className={'mb-6 text-zinc-600 dark:text-zinc-400'}>{t('users.noUsersDescription')}</p>
      <Button onClick={onCreate}>
        <Plus className={'size-4'} />
        {t('users.addUser')}
      </Button>
    </div>
  );
}
