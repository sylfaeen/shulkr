import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/shadcn/form';
import { FileTreeSelector } from '@shulkr/frontend/features/ui/file_tree_selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { useUpdateSftpAccount } from '@shulkr/frontend/hooks/use_sftp';
import type { SftpAccountResponse } from '@shulkr/shared';

type EditSftpAccountDialogProps = {
  open: boolean;
  onOpenChange: () => void;
  serverId: string;
  account: SftpAccountResponse;
};

export function EditSftpAccountDialog({ open, onOpenChange, serverId, account }: EditSftpAccountDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange()}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('settings.sftp.dialog.editTitle')}</DialogTitle>
          <DialogDescription>{t('settings.sftp.dialog.editDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <EditSftpAccountForm enabled={open} onClose={onOpenChange} {...{ serverId, account }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onOpenChange} variant={'secondary'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'edit-sftp-account-form'}>
            {t('settings.sftp.dialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EditSftpAccountFormProps = {
  serverId: string;
  account: SftpAccountResponse;
  enabled: boolean;
  onClose: () => void;
};

function EditSftpAccountForm({ serverId, account, enabled, onClose }: EditSftpAccountFormProps) {
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

  const generateUsername = useCallback(() => {
    const adjectives = ['fast', 'cool', 'slim', 'bold', 'dark', 'wild', 'keen', 'warm', 'soft', 'safe'];
    const nouns = ['fox', 'owl', 'elk', 'ram', 'bee', 'ant', 'cat', 'bat', 'jay', 'yak'];
    const array = new Uint8Array(3);
    crypto.getRandomValues(array);
    const adj = adjectives[array[0] % adjectives.length];
    const noun = nouns[array[1] % nouns.length];
    const num = String(array[2] % 100).padStart(2, '0');
    form.setValue('username', `${adj}-${noun}-${num}`, { shouldValidate: true });
  }, [form]);

  const generatePassword = useCallback(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_=+';
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    const generated = Array.from(array, (byte) => chars[byte % chars.length]).join('');
    form.setValue('password', generated, { shouldValidate: true });
    setShowPassword(true);
  }, [form]);

  const handleFormSubmit = async (data: EditSftpAccountFormValues) => {
    const allowedPaths = Array.from(selectedPaths);

    await updateSftpAccount.mutateAsync({
      id: account.id,
      username: data.username !== account.username ? data.username : undefined,
      password: data.password.length > 0 ? data.password : undefined,
      permissions: data.permissions,
      allowedPaths,
    });

    onClose();
  };

  return (
    <Form {...form}>
      <form id={'edit-sftp-account-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <FormField
          control={form.control}
          name={'username'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.sftp.dialog.username')}</FormLabel>
              <div className={'flex gap-2'}>
                <FormControl>
                  <Input type={'text'} placeholder={t('settings.sftp.dialog.usernamePlaceholder')} {...field} />
                </FormControl>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={generateUsername} variant={'secondary'} size={'icon-lg'}>
                        <RefreshCw className={'size-3.5'} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                      {t('settings.sftp.dialog.generate')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormDescription className={'text-xs text-zinc-400 dark:text-zinc-500'}>
                {t('settings.sftp.dialog.usernameHint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'password'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.sftp.dialog.password')}</FormLabel>
              <div className={'flex gap-2'}>
                <FormControl>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('settings.sftp.dialog.passwordEditPlaceholder')}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (showPassword) setShowPassword(false);
                    }}
                  />
                </FormControl>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={generatePassword} variant={'secondary'} size={'icon-lg'}>
                        <RefreshCw className={'size-3.5'} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                      {t('settings.sftp.dialog.generate')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'permissions'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.sftp.dialog.permissions')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={'read-only'}>{t('settings.sftp.dialog.permissionReadOnly')}</SelectItem>
                  <SelectItem value={'read-write'}>{t('settings.sftp.dialog.permissionReadWrite')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <FormLabel>{t('settings.sftp.dialog.allowedPaths')}</FormLabel>
          <p className={'mb-2 text-xs text-zinc-400 dark:text-zinc-500'}>{t('settings.sftp.dialog.allowedPathsHint')}</p>
          <FileTreeSelector
            selectedPaths={selectedPaths}
            onSelectedPathsChange={setSelectedPaths}
            directoriesOnly
            {...{ serverId, enabled }}
          />
        </div>
      </form>
    </Form>
  );
}
