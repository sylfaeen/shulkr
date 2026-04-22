import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AVAILABLE_PERMISSIONS, type UserResponse } from '@shulkr/shared';

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogError,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';

type EditUserFormData = {
  username: string;
  password?: string;
  permissions: Array<string>;
};

type EditUserDialogProps = {
  user: UserResponse;
  onSubmit: (data: EditUserFormData) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
};

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

export function EditUserDialog({ user, onSubmit, onCancel, isLoading, error }: EditUserDialogProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Array<string>>(user.permissions);
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
  const handleSubmit = (data: EditUserFormValues) => {
    const formData: EditUserFormData = { username: data.username, permissions };
    if (data.password) {
      formData.password = data.password;
    }
    onSubmit(formData).then();
  };
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.editUser')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id={'edit-user'} onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogBody>
              {error && <DialogError>{error}</DialogError>}
              <FormField
                control={form.control}
                name={'username'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.username')} *</FormLabel>
                    <FormControl>
                      <Input type={'text'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'password'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('users.password')} {t('users.passwordHint')}
                    </FormLabel>
                    <FormControl>
                      <Input type={'password'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <span className={'mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
                  {t('users.permissions')}
                </span>
                <div className={'space-y-3'}>
                  <Label className={'flex cursor-pointer items-center gap-2'}>
                    <Checkbox checked={permissions.includes('*')} onCheckedChange={() => togglePermission('*')} />
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
                            />
                            <span className={'text-zinc-600 dark:text-zinc-400'}>{t(`users.permissionNames.${permission}`)}</span>
                          </Label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </DialogBody>
          </form>
        </Form>
        <DialogFooter>
          <Button onClick={onCancel} variant={'ghost'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'edit-user'} disabled={isLoading} loading={isLoading}>
            {isLoading ? t('users.saving') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
