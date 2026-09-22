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
} from '@shulkr/frontend/features/ui/base/dialog';
import { Input } from '@shulkr/frontend/features/ui/base/input';
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
import { useCreateDatabase } from '@shulkr/frontend/hooks/use_databases';
import { DatabaseCredentialsPanel, buildPluginSnippet } from '@shulkr/frontend/pages/app/servers/features/database_credentials';
import type { DatabaseCredentials } from '@shulkr/shared';

export function CreateDatabaseDialog({
  open,
  onOpenChange,
  serverId,
  prefixHint,
}: {
  open: boolean;
  onOpenChange: () => void;
  serverId: string;
  prefixHint: string | null;
}) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);

  const handleClose = () => {
    setCredentials(null);
    onOpenChange();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={'max-w-xl'}>
        <DialogHeader>
          <DialogTitle>{credentials ? t('databases.dialog.createdTitle') : t('databases.dialog.createTitle')}</DialogTitle>
          <DialogDescription>
            {credentials ? t('databases.dialog.createdDescription') : t('databases.dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>
        {credentials ? (
          <>
            <DialogBody>
              <DatabaseCredentialsPanel
                credentials={credentials}
                warning={t('databases.dialog.passwordWarning')}
                snippet={{ label: t('databases.dialog.pluginSnippet'), content: buildPluginSnippet(credentials) }}
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={handleClose}>{t('common.close')}</Button>
            </DialogFooter>
          </>
        ) : (
          <CreateDatabaseForm onCreated={setCredentials} onClose={handleClose} {...{ serverId, prefixHint }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateDatabaseForm({
  serverId,
  prefixHint,
  onCreated,
  onClose,
}: {
  serverId: string;
  prefixHint: string | null;
  onCreated: (credentials: DatabaseCredentials) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createDatabase = useCreateDatabase(serverId);

  const schema = z.object({
    slug: z
      .string()
      .min(1, t('databases.dialog.nameRequired'))
      .max(16, t('databases.dialog.nameTooLong'))
      .regex(/^[a-z][a-z0-9_]*$/, t('databases.dialog.nameInvalid')),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { slug: '' } });
  const slug = form.watch('slug');

  const handleFormSubmit = async (data: FormValues) => {
    const result = await createDatabase.mutateAsync(data.slug);
    onCreated(result.credentials);
  };

  return (
    <>
      <DialogBody>
        <Form {...form}>
          <form id={'create-database-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleFormSubmit)}>
            <FormField
              control={form.control}
              name={'slug'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('databases.dialog.nameLabel')}</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder={'flyteams'} {...field} />
                  </FormControl>
                  <FormDescription>{t('databases.dialog.nameHint')}</FormDescription>
                  {slug && prefixHint && (
                    <p className={'font-jetbrains text-xs text-zinc-500 dark:text-zinc-400'}>
                      {t('databases.dialog.finalName', { name: `s_${prefixHint}_${slug}` })}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant={'ghost'} disabled={createDatabase.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type={'submit'} form={'create-database-form'} loading={createDatabase.isPending}>
          {t('databases.dialog.create')}
        </Button>
      </DialogFooter>
    </>
  );
}
