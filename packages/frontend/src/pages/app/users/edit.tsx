import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, ScrollText, ChevronLeft, ChevronRight, ChevronDown, Info } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { AVAILABLE_PERMISSIONS } from '@shulkr/shared';
import { useUser, useUpdateUser } from '@shulkr/frontend/hooks/use_users';
import { useAuditLogs } from '@shulkr/frontend/hooks/use_audit';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import { ApiError } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';

const PERMISSION_GROUPS = [
  {
    key: 'server',
    permissions: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('server:')),
  },
  {
    key: 'files',
    permissions: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('files:')),
  },
  {
    key: 'users',
    permissions: AVAILABLE_PERMISSIONS.filter((p) => p === 'users:manage'),
  },
  {
    key: 'settings',
    permissions: AVAILABLE_PERMISSIONS.filter((p) => p.startsWith('settings:')),
  },
] as const;

const AUDIT_PAGE_SIZE = 20;

export function UserEditPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const userId = Number(id);
  const { data: user, isLoading, error } = useUser(userId);
  const currentUser = useAuthStore((state) => state.user);
  const isSelf = currentUser?.id === userId;

  usePageTitle('shulkr • ' + (user?.username ?? t('users.editUser')));

  if (isLoading) return <PageLoader />;
  if (error || !user) return <PageError message={'User not found'} />;

  return (
    <PageContent>
      <FeatureCard.Stack>
        <EditSection {...{ user, isSelf }} />
        <AuditSection {...{ userId }} />
      </FeatureCard.Stack>
    </PageContent>
  );
}

const editUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z
    .string()
    .max(128)
    .optional()
    .refine((val) => !val || val.length >= 8, { message: 'Minimum 8 characters' })
    .or(z.literal('')),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

function EditSection({ user, isSelf }: { user: { id: number; username: string; permissions: Array<string> }; isSelf: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useUpdateUser();
  const [permissions, setPermissions] = useState<Array<string>>(user.permissions);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: user.username,
      password: '',
    },
  });

  const togglePermission = (permission: string) => {
    if (permission === '*') {
      setPermissions(permissions.includes('*') ? [] : ['*']);
    } else {
      const newPermissions = permissions.filter((p) => p !== '*');
      if (newPermissions.includes(permission)) {
        setPermissions(newPermissions.filter((p) => p !== permission));
      } else {
        setPermissions([...newPermissions, permission]);
      }
    }
  };

  const handleSubmit = async (data: EditUserFormValues) => {
    setFormError(null);
    try {
      const body: { id: number; username: string; password?: string; permissions: Array<string> } = {
        id: user.id,
        username: data.username,
        permissions,
      };
      if (data.password) body.password = data.password;
      await updateUser.mutateAsync(body);
      navigate({ to: '/app/users' }).then();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t('errors.generic'));
      }
    }
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('users.editUser')}</FeatureCard.Title>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <FeatureCard.Body>
            {formError && (
              <div className={'px-5 py-3'}>
                <p className={'text-sm text-red-600'}>{formError}</p>
              </div>
            )}
            <FeatureCard.Row layout={'column'}>
              <FormField
                control={form.control}
                name={'username'}
                render={({ field }) => (
                  <FormItem className={'w-full'}>
                    <FormLabel>{t('users.username')}</FormLabel>
                    <FormControl>
                      <Input type={'text'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FeatureCard.Row>
            <FeatureCard.Row layout={'column'}>
              <FormField
                control={form.control}
                name={'password'}
                render={({ field }) => (
                  <FormItem className={'w-full'}>
                    <FormLabel>
                      {t('users.password')} <span className={'text-zinc-400'}>{t('users.passwordHint')}</span>
                    </FormLabel>
                    <FormControl>
                      <Input type={'password'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FeatureCard.Row>
            <FeatureCard.Row layout={'column'}>
              <span className={'mb-1.5 block text-sm font-medium'}>{t('users.permissions')}</span>
              {isSelf && (
                <Alert variant={'warning'}>
                  <Info className={'size-4'} />
                  <AlertDescription dangerouslySetInnerHTML={{ __html: t('users.cannotEditOwnPermissions') }} />
                </Alert>
              )}
              <div className={cn('w-full space-y-3', isSelf && 'pointer-events-none opacity-60')}>
                <Label className={'flex cursor-pointer items-center gap-2'}>
                  <Checkbox checked={permissions.includes('*')} onCheckedChange={() => togglePermission('*')} disabled={isSelf} />
                  <span className={'font-medium text-zinc-900 dark:text-zinc-100'}>{t('users.allPermissions')}</span>
                </Label>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.key}>
                    <span
                      className={'mb-1 block text-xs font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500'}
                    >
                      {t(`users.permissionGroups.${group.key}`)}
                    </span>
                    <div className={'space-y-1'}>
                      {group.permissions.map((permission) => (
                        <Label key={permission} className={'flex cursor-pointer items-center gap-2'}>
                          <Checkbox
                            checked={permissions.includes(permission)}
                            onCheckedChange={() => togglePermission(permission)}
                            disabled={isSelf}
                          />
                          <span className={'text-zinc-600 dark:text-zinc-400'}>{t(`users.permissionNames.${permission}`)}</span>
                        </Label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </FeatureCard.Row>
          </FeatureCard.Body>
          <FeatureCard.Footer>
            <div className={'flex items-center justify-end gap-2'}>
              <Button onClick={() => navigate({ to: '/app/users' })} variant={'secondary'} size={'sm'}>
                {t('common.cancel')}
              </Button>
              <Button type={'submit'} size={'sm'} disabled={updateUser.isPending} loading={updateUser.isPending}>
                <Save className={'size-4'} />
                {t('common.save')}
              </Button>
            </div>
          </FeatureCard.Footer>
        </form>
      </Form>
    </FeatureCard>
  );
}

function AuditSection({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const offset = page * AUDIT_PAGE_SIZE;

  const { data, isLoading } = useAuditLogs({ userId, limit: AUDIT_PAGE_SIZE, offset });

  const totalPages = data ? Math.ceil(data.total / AUDIT_PAGE_SIZE) : 0;

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title count={data?.total}>{t('users.audit.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('users.audit.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {isLoading ? (
          <FeatureCard.Row>
            <div className={'flex w-full justify-center py-8'}>
              <span className={'text-sm text-zinc-400'}>{t('common.loading')}</span>
            </div>
          </FeatureCard.Row>
        ) : !data || data.entries.length === 0 ? (
          <FeatureCard.Empty icon={ScrollText} title={t('users.audit.empty')} description={t('users.audit.emptyDescription')} />
        ) : (
          data.entries.map((entry) => <AuditRow key={entry.id} {...{ entry }} />)
        )}
      </FeatureCard.Body>
      {totalPages > 1 && (
        <FeatureCard.Footer>
          <div className={'flex items-center justify-between'}>
            <span className={'text-xs text-zinc-400'}>{t('users.audit.page', { current: page + 1, total: totalPages })}</span>
            <div className={'flex items-center gap-1'}>
              <Button onClick={() => setPage(page - 1)} variant={'ghost'} size={'icon-xs'} disabled={page === 0}>
                <ChevronLeft className={'size-4'} />
              </Button>
              <Button onClick={() => setPage(page + 1)} variant={'ghost'} size={'icon-xs'} disabled={page >= totalPages - 1}>
                <ChevronRight className={'size-4'} />
              </Button>
            </div>
          </div>
        </FeatureCard.Footer>
      )}
    </FeatureCard>
  );
}

type AuditEntry = {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  details: Record<string, string> | null;
  ipAddress: string | null;
  createdAt: string;
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  const date = new Date(entry.createdAt);
  const formattedDate = date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <FeatureCard.Row
        className={cn('py-2', hasDetails && 'cursor-pointer')}
        interactive={hasDetails || undefined}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className={'flex min-w-0 flex-1 items-center gap-3'}>
          {hasDetails && (
            <ChevronDown
              className={cn('size-3.5 shrink-0 text-zinc-400 transition-transform', expanded && 'rotate-180')}
              strokeWidth={2}
            />
          )}
          <Badge variant={'outline'} size={'sm'}>
            {entry.action}
          </Badge>
          <span className={'truncate text-sm text-zinc-600 dark:text-zinc-400'}>
            {entry.resourceType}
            {entry.resourceName ? <span className={'text-zinc-400 dark:text-zinc-500'}> {entry.resourceName}</span> : null}
          </span>
        </div>
        <FeatureCard.RowControl>
          <div className={'flex items-center gap-3'}>
            {entry.ipAddress && <span className={'hidden text-xs text-zinc-400 sm:inline'}>{entry.ipAddress}</span>}
            <span className={'text-xs text-zinc-400'}>
              {formattedDate} {formattedTime}
            </span>
          </div>
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      {expanded && hasDetails && <AuditDetails details={entry.details!} />}
    </div>
  );
}

function AuditDetails({ details }: { details: Record<string, string> }) {
  return (
    <div className={'flex px-5 pb-4'}>
      <div className={'relative flex w-3 shrink-0 justify-center'}>
        <div className={'absolute top-0 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700'} />
        <div className={'absolute bottom-0 size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600'} />
      </div>
      <div className={'ml-3 min-w-0 flex-1 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50'}>
        {Object.entries(details).map(([key, value]) => (
          <div key={key} className={'flex gap-2 py-0.5 text-xs'}>
            <span className={'shrink-0 font-medium text-zinc-500 dark:text-zinc-400'}>{key}</span>
            <span className={'truncate text-zinc-600 dark:text-zinc-300'}>{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
