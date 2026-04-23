import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Form } from '@shulkr/frontend/features/ui/shadcn/form';
import { useUpdateSftpAccount } from '@shulkr/frontend/hooks/use_sftp';
import type { SftpAccountResponse } from '@shulkr/shared';
import { SftpAccountFormFields } from '@shulkr/frontend/pages/app/servers/dialogs/create_sftp_account_dialog';

export function EditSftpAccountDialog({
  open,
  onOpenChange,
  serverId,
  account,
}: {
  open: boolean;
  onOpenChange: () => void;
  serverId: string;
  account: SftpAccountResponse;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange()}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('settings.sftp.dialog.editTitle')}</DialogTitle>
          <DialogDescription>{t('settings.sftp.dialog.editDescription')}</DialogDescription>
        </DialogHeader>
        <EditSftpAccountForm enabled={open} onClose={onOpenChange} {...{ serverId, account }} />
      </DialogContent>
    </Dialog>
  );
}

function EditSftpAccountForm({
  serverId,
  account,
  enabled,
  onClose,
}: {
  serverId: string;
  account: SftpAccountResponse;
  enabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updateSftpAccount = useUpdateSftpAccount(serverId);
  const editSftpAccountSchema = z.object({
    username: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z_][a-z0-9_-]*$/),
    password: z.string().refine((val) => val === '' || val.length >= 8, { message: 'Minimum 8 characters' }),
    permissions: z.enum(['read-only', 'read-write']).default('read-only'),
  });
  type EditSftpAccountFormValues = z.infer<typeof editSftpAccountSchema>;
  const form = useForm<EditSftpAccountFormValues>({
    resolver: zodResolver(editSftpAccountSchema),
    defaultValues: {
      username: account.username,
      password: '',
      permissions: account.permissions,
    },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set(account.allowedPaths));
  const handleFormSubmit = async (data: EditSftpAccountFormValues) => {
    await updateSftpAccount.mutateAsync({
      id: account.id,
      username: data.username !== account.username ? data.username : undefined,
      password: data.password.length > 0 ? data.password : undefined,
      permissions: data.permissions,
      allowedPaths: Array.from(selectedPaths),
    });
    onClose();
  };
  return (
    <>
      <DialogBody>
        <Form {...form}>
          <form id={'edit-sftp-account-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleFormSubmit)}>
            <SftpAccountFormFields
              passwordPlaceholder={t('settings.sftp.dialog.passwordEditPlaceholder')}
              onShowPasswordChange={setShowPassword}
              {...{ serverId, enabled, selectedPaths, showPassword }}
              onSelectedPathsChange={setSelectedPaths}
            />
          </form>
        </Form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant={'ghost'}>
          {t('common.cancel')}
        </Button>
        <Button type={'submit'} form={'edit-sftp-account-form'} loading={updateSftpAccount.isPending}>
          {t('settings.sftp.dialog.save')}
        </Button>
      </DialogFooter>
    </>
  );
}
