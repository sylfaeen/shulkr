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
  DialogBody,
  DialogFooter,
  DialogError,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import { PermissionPicker } from '@shulkr/frontend/features/permission_picker';

type CreateUserFormData = {
  username: string;
  password: string;
  permissions: Array<string>;
};

export function CreateUserDialog({
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  onSubmit: (data: CreateUserFormData) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Array<string>>([]);
  const [showPassword, setShowPassword] = useState(false);

  const createUserSchema = z.object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_-]+$/),
    password: z.string().min(8).max(128),
  });

  type CreateUserFormValues = z.infer<typeof createUserSchema>;

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

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

  const handleSubmit = (data: CreateUserFormValues) => {
    onSubmit({ ...data, permissions }).then();
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
          <DialogTitle>{t('users.addUser')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id={'create-user'} onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogBody>
              {error && <DialogError>{error}</DialogError>}
              <FormField
                control={form.control}
                name={'username'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.username')} *</FormLabel>
                    <div className={'flex gap-2'}>
                      <FormControl>
                        <Input type={'text'} {...field} />
                      </FormControl>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button onClick={generateUsername} variant={'secondary'} size={'icon-lg'}>
                              <RefreshCw className={'size-3.5'} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('users.generate')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'password'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.password')} *</FormLabel>
                    <div className={'flex gap-2'}>
                      <FormControl>
                        <Input
                          type={showPassword ? 'text' : 'password'}
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
                          <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('users.generate')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <span className={'mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
                  {t('users.permissions')}
                </span>
                <PermissionPicker value={permissions} onChange={setPermissions} />
              </div>
            </DialogBody>
          </form>
        </Form>
        <DialogFooter>
          <Button onClick={onCancel} variant={'secondary'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'create-user'} disabled={isLoading} loading={isLoading}>
            {isLoading ? t('users.creating', 'Creating...') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
