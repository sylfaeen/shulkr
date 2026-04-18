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
  DialogError,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/shadcn/form';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';

const createServerSchema = z.object({
  name: z.string().min(1),
  min_ram: z.string().default('2G'),
  max_ram: z.string().default('4G'),
  jvm_flags: z.string().default(''),
  java_port: z.coerce.number().min(1024).max(65535).default(25565),
  auto_start: z.boolean().default(true),
});

type CreateServerFormValues = z.infer<typeof createServerSchema>;

type CreateServerDialogProps = {
  onSubmit: (data: CreateServerFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
};

export function CreateServerDialog({ onSubmit, onCancel, isLoading, error }: CreateServerDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('servers.addServer')}</DialogTitle>
          <DialogDescription>
            {t(
              'servers.manualSetupInfo',
              'The server directory will be created. You can then upload a JAR file via the file manager.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CreateServerForm {...{ onSubmit, error }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel} variant={'ghost'} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'create-server'} loading={isLoading} disabled={isLoading}>
            {isLoading ? t('servers.creating', 'Creating...') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateServerForm({ onSubmit, error }: Pick<CreateServerDialogProps, 'onSubmit' | 'error'>) {
  const { t } = useTranslation();

  const form = useForm<CreateServerFormValues>({
    resolver: zodResolver(createServerSchema),
    defaultValues: {
      name: '',
      min_ram: '2G',
      max_ram: '4G',
      jvm_flags: '',
      java_port: 25565,
      auto_start: true,
    },
  });

  const onFormSubmit = (data: CreateServerFormValues) => {
    onSubmit(data).then();
  };

  return (
    <Form {...form}>
      <form id={'create-server'} className={'space-y-6'} onSubmit={form.handleSubmit(onFormSubmit)}>
        {error && <DialogError>{error}</DialogError>}
        <FormField
          control={form.control}
          name={'name'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('servers.serverName')} *</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={t('servers.serverNamePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>
                {t('servers.nameHint', 'The server directory and files will be created automatically')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className={'grid grid-cols-2 gap-4'}>
          <FormField
            control={form.control}
            name={'min_ram'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('servers.minRam')}</FormLabel>
                <FormControl>
                  <Input type={'text'} placeholder={'2G'} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={'max_ram'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('servers.maxRam')}</FormLabel>
                <FormControl>
                  <Input type={'text'} placeholder={'4G'} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name={'java_port'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('servers.port')}</FormLabel>
              <FormControl>
                <Input
                  type={'number'}
                  min={1024}
                  max={65535}
                  className={'w-32'}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'jvm_flags'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('servers.jvmFlagsAdditional')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={'-XX:+UseG1GC'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'auto_start'}
          render={({ field }) => (
            <FormItem className={'flex cursor-pointer items-center gap-2'}>
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className={'text-zinc-600 dark:text-zinc-400'}>{t('servers.autoStartDesc')}</FormLabel>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
