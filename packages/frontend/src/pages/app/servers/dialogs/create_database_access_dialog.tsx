import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, TriangleAlert } from 'lucide-react';
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
import { Switch } from '@shulkr/frontend/features/ui/base/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/base/form';
import { useCreateDatabaseAccess, useDownloadCaCertificate } from '@shulkr/frontend/hooks/use_databases';
import {
  ClientCertificateBlock,
  DatabaseCredentialsPanel,
  buildLaravelSnippet,
} from '@shulkr/frontend/pages/app/servers/features/database_credentials';
import type { DatabaseAccessCredentials } from '@shulkr/shared';

export function CreateDatabaseAccessDialog({
  open,
  onOpenChange,
  databaseId,
  serverId,
  isFirstRemoteAccess,
}: {
  open: boolean;
  onOpenChange: () => void;
  databaseId: number;
  serverId: string;
  isFirstRemoteAccess: boolean;
}) {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<DatabaseAccessCredentials | null>(null);
  const downloadCa = useDownloadCaCertificate();

  const handleClose = () => {
    setCredentials(null);
    onOpenChange();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={'max-w-xl'}>
        <DialogHeader>
          <DialogTitle>{credentials ? t('databases.access.createdTitle') : t('databases.access.createTitle')}</DialogTitle>
          <DialogDescription>
            {credentials ? t('databases.access.createdDescription') : t('databases.access.createDescription')}
          </DialogDescription>
        </DialogHeader>
        {credentials ? (
          <>
            <DialogBody>
              <div className={'space-y-4'}>
                <DatabaseCredentialsPanel
                  credentials={credentials}
                  warning={t('databases.dialog.passwordWarning')}
                  snippet={{
                    label: t('databases.access.laravelSnippet'),
                    content: buildLaravelSnippet(credentials, Boolean(credentials.clientCertificate)),
                  }}
                />
                <Button size={'sm'} variant={'outline'} icon={Download} onClick={downloadCa}>
                  {t('databases.access.downloadCa')}
                </Button>
                {credentials.clientCertificate && credentials.clientKey && (
                  <ClientCertificateBlock certificate={credentials.clientCertificate} privateKey={credentials.clientKey} />
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button onClick={handleClose}>{t('common.close')}</Button>
            </DialogFooter>
          </>
        ) : (
          <CreateAccessForm onCreated={setCredentials} onClose={handleClose} {...{ databaseId, serverId, isFirstRemoteAccess }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateAccessForm({
  databaseId,
  serverId,
  isFirstRemoteAccess,
  onCreated,
  onClose,
}: {
  databaseId: number;
  serverId: string;
  isFirstRemoteAccess: boolean;
  onCreated: (credentials: DatabaseAccessCredentials) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createAccess = useCreateDatabaseAccess(databaseId, serverId);

  // Refused here as well as in the API and the privileged script: a wildcard would turn a pinned access into an open door, and each layer covers a different call path.
  const schema = z.object({
    label: z
      .string()
      .min(1, t('databases.access.labelRequired'))
      .max(32)
      .regex(/^[\w -]+$/, t('databases.access.labelInvalid')),
    scope: z.enum(['read', 'write']),
    allowedIp: z
      .string()
      .min(1, t('databases.access.ipRequired'))
      .refine((value) => !value.includes('%') && !value.includes('/') && !value.includes('*'), t('databases.access.ipTooBroad'))
      .refine((value) => value !== '0.0.0.0' && value.toLowerCase() !== 'localhost', t('databases.access.ipTooBroad'))
      .refine((value) => {
        if (value.includes(':')) return /^[0-9a-fA-F:]+$/.test(value);

        return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((octet) => Number(octet) <= 255);
      }, t('databases.access.ipInvalid')),
    requireCertificate: z.boolean(),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', scope: 'read', allowedIp: '', requireCertificate: false },
  });

  const handleFormSubmit = async (data: FormValues) => {
    const result = await createAccess.mutateAsync(data);
    onCreated(result.credentials);
  };

  return (
    <>
      <DialogBody>
        <Form {...form}>
          <form id={'create-database-access-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleFormSubmit)}>
            <FormField
              control={form.control}
              name={'label'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('databases.access.labelLabel')}</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder={'flycraft-site'} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={'scope'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('databases.access.scopeLabel')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={'read'}>{t('databases.access.scopeRead')}</SelectItem>
                      <SelectItem value={'write'}>{t('databases.access.scopeWrite')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {field.value === 'read' ? t('databases.access.scopeReadHint') : t('databases.access.scopeWriteHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={'allowedIp'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('databases.access.ipLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={'82.64.12.34'} {...field} />
                  </FormControl>
                  <FormDescription>{t('databases.access.ipHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={'requireCertificate'}
              render={({ field }) => (
                <FormItem className={'flex items-center justify-between gap-4'}>
                  <div className={'space-y-1'}>
                    <FormLabel>{t('databases.access.certificateLabel')}</FormLabel>
                    <FormDescription>{t('databases.access.certificateHint')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {isFirstRemoteAccess && (
              <p
                className={
                  'flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                }
              >
                <TriangleAlert className={'mt-0.5 size-4 shrink-0'} />
                <span>{t('databases.access.restartWarning')}</span>
              </p>
            )}
          </form>
        </Form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} variant={'ghost'} disabled={createAccess.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type={'submit'} form={'create-database-access-form'} loading={createAccess.isPending}>
          {t('databases.access.create')}
        </Button>
      </DialogFooter>
    </>
  );
}
