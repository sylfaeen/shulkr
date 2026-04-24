import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFormContext } from 'react-hook-form';
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
} from '@shulkr/frontend/features/ui/base/dialog';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/base/form';
import { FileTreeSelector } from '@shulkr/frontend/features/ui/file_tree_selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { useCreateSftpAccount } from '@shulkr/frontend/hooks/use_sftp';

export function CreateSftpAccountDialog({
  open,
  onOpenChange,
  serverId,
}: {
  open: boolean;
  onOpenChange: () => void;
  serverId: string;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange()}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('settings.sftp.dialog.createTitle')}</DialogTitle>
          <DialogDescription>{t('settings.sftp.dialog.createDescription')}</DialogDescription>
        </DialogHeader>
        <CreateSftpAccountForm enabled={open} onClose={onOpenChange} {...{ serverId }} />
      </DialogContent>
    </Dialog>
  );
}

function CreateSftpAccountForm({ serverId, enabled, onClose }: { serverId: string; enabled: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createSftpAccount = useCreateSftpAccount(serverId);
  const createSftpAccountSchema = z.object({
    username: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z_][a-z0-9_-]*$/),
    password: z.string().min(8),
    permissions: z.enum(['read-only', 'read-write']).default('read-only'),
  });
  type CreateSftpAccountFormValues = z.infer<typeof createSftpAccountSchema>;
  const form = useForm<CreateSftpAccountFormValues>({
    resolver: zodResolver(createSftpAccountSchema),
    defaultValues: { username: '', password: '', permissions: 'read-write' },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const handleFormSubmit = async (data: CreateSftpAccountFormValues) => {
    await createSftpAccount.mutateAsync({
      username: data.username,
      password: data.password,
      permissions: data.permissions,
      allowedPaths: Array.from(selectedPaths),
    });
    onClose();
  };
  return (
    <>
      <DialogBody>
        <Form {...form}>
          <form id={'create-sftp-account-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleFormSubmit)}>
            <SftpAccountFormFields
              passwordPlaceholder={t('settings.sftp.dialog.passwordPlaceholder')}
              onShowPasswordChange={setShowPassword}
              {...{ serverId, enabled, selectedPaths, showPassword }}
              onSelectedPathsChange={setSelectedPaths}
            />
          </form>
        </Form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant={'ghost'} disabled={createSftpAccount.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type={'submit'} form={'create-sftp-account-form'} loading={createSftpAccount.isPending}>
          {t('settings.sftp.dialog.create')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SftpAccountFormFields({
  serverId,
  enabled,
  selectedPaths,
  onSelectedPathsChange,
  showPassword,
  onShowPasswordChange,
  passwordPlaceholder,
}: {
  serverId: string;
  enabled: boolean;
  selectedPaths: Set<string>;
  onSelectedPathsChange: (paths: Set<string>) => void;
  showPassword: boolean;
  onShowPasswordChange: (show: boolean) => void;
  passwordPlaceholder: string;
}) {
  const { t } = useTranslation();
  const form = useFormContext();
  const handleGenerateUsername = useCallback(() => {
    form.setValue('username', generateRandomUsername(), { shouldValidate: true });
  }, [form]);
  const handleGeneratePassword = useCallback(() => {
    form.setValue('password', generateRandomPassword(), { shouldValidate: true });
    onShowPasswordChange(true);
  }, [form, onShowPasswordChange]);
  return (
    <>
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
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        onClick={handleGenerateUsername}
                        variant={'secondary'}
                        size={'icon-lg'}
                        icon={RefreshCw}
                        iconClass={'size-3.5'}
                      />
                    }
                  />
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
                  placeholder={passwordPlaceholder}
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (showPassword) onShowPasswordChange(false);
                  }}
                />
              </FormControl>
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        onClick={handleGeneratePassword}
                        variant={'secondary'}
                        size={'icon-lg'}
                        icon={RefreshCw}
                        iconClass={'size-3.5'}
                      />
                    }
                  />
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
          onSelectedPathsChange={onSelectedPathsChange}
          directoriesOnly
          {...{ serverId, enabled }}
        />
      </div>
    </>
  );
}

export function generateRandomUsername(): string {
  const adjectives = ['fast', 'cool', 'slim', 'bold', 'dark', 'wild', 'keen', 'warm', 'soft', 'safe'];
  const nouns = ['fox', 'owl', 'elk', 'ram', 'bee', 'ant', 'cat', 'bat', 'jay', 'yak'];
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  const adj = adjectives[array[0] % adjectives.length];
  const noun = nouns[array[1] % nouns.length];
  const num = String(array[2] % 100).padStart(2, '0');
  return `${adj}-${noun}-${num}`;
}

export function generateRandomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_=+';
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}
