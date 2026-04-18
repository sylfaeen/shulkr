import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shulkr/frontend/features/ui/shadcn/select';
import {
  useCreateCloudDestination,
  useUpdateCloudDestination,
  useTestCloudDestination,
} from '@shulkr/frontend/hooks/use_cloud_destinations';
import type { CloudDestinationResponse, CloudProvider, TestConnectionResult } from '@shulkr/shared';

const PROVIDERS: Array<CloudProvider> = ['aws-s3', 'cloudflare-r2', 'backblaze-b2', 'wasabi', 'minio-custom'];

const defaultEndpoints: Record<CloudProvider, string> = {
  'aws-s3': 'https://s3.amazonaws.com',
  'cloudflare-r2': 'https://<account-id>.r2.cloudflarestorage.com',
  'backblaze-b2': 'https://s3.us-west-004.backblazeb2.com',
  'wasabi': 'https://s3.wasabisys.com',
  'minio-custom': 'https://minio.example.com',
};

const destinationSchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.enum(['aws-s3', 'cloudflare-r2', 'backblaze-b2', 'wasabi', 'minio-custom']),
  endpoint: z.string().url(),
  region: z.string().min(1).max(64),
  bucket: z.string().min(1).max(256),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  prefix: z.string().max(256),
});

type FormValues = z.infer<typeof destinationSchema>;

export function CloudDestinationDialog({
  destination,
  onClose,
}: {
  destination?: CloudDestinationResponse;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(destination);

  const createMutation = useCreateCloudDestination();
  const updateMutation = useUpdateCloudDestination();
  const testMutation = useTestCloudDestination();

  const form = useForm<FormValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: {
      name: destination?.name ?? '',
      provider: destination?.provider ?? 'aws-s3',
      endpoint: destination?.endpoint ?? defaultEndpoints['aws-s3'],
      region: destination?.region ?? 'us-east-1',
      bucket: destination?.bucket ?? '',
      accessKeyId: destination?.accessKeyId ?? '',
      secretAccessKey: '',
      prefix: destination?.prefix ?? '',
    },
  });

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const handleProviderChange = (provider: CloudProvider) => {
    form.setValue('provider', provider);
    if (!isEdit) form.setValue('endpoint', defaultEndpoints[provider]);
  };

  const handleTest = async () => {
    setTestResult(null);
    const values = form.getValues();
    const result = await testMutation.mutateAsync(values).catch(() => null);
    if (result) setTestResult(result);
  };

  const handleSubmit = async (values: FormValues) => {
    if (isEdit && destination) {
      const patch: Record<string, unknown> = { ...values };
      if (!values.secretAccessKey) delete patch.secretAccessKey;
      await updateMutation.mutateAsync({ id: destination.id, body: patch });
    } else {
      await createMutation.mutateAsync(values);
    }
    onClose();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('cloudDestinations.edit.title') : t('cloudDestinations.create.title')}</DialogTitle>
          <DialogDescription>{t('cloudDestinations.create.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Form {...form}>
            <form id={'cloud-destination-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleSubmit)}>
              <FormField
                control={form.control}
                name={'name'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cloudDestinations.fields.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={'Production S3'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'provider'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cloudDestinations.fields.provider')}</FormLabel>
                    <Select value={field.value} onValueChange={(v) => handleProviderChange(v as CloudProvider)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {t(`cloudDestinations.providers.${p}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'endpoint'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cloudDestinations.fields.endpoint')}</FormLabel>
                    <FormControl>
                      <Input className={'font-jetbrains'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={'grid gap-4 sm:grid-cols-2'}>
                <FormField
                  control={form.control}
                  name={'region'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cloudDestinations.fields.region')}</FormLabel>
                      <FormControl>
                        <Input placeholder={'us-east-1'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={'bucket'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cloudDestinations.fields.bucket')}</FormLabel>
                      <FormControl>
                        <Input placeholder={'my-shulkr-backups'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name={'accessKeyId'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cloudDestinations.fields.accessKeyId')}</FormLabel>
                    <FormControl>
                      <Input className={'font-jetbrains'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'secretAccessKey'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('cloudDestinations.fields.secretAccessKey')}
                      {isEdit && <span className={'ml-2 text-xs text-zinc-500'}>{t('cloudDestinations.fields.leaveBlankToKeep')}</span>}
                    </FormLabel>
                    <FormControl>
                      <Input type={'password'} className={'font-jetbrains'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'prefix'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cloudDestinations.fields.prefix')}</FormLabel>
                    <FormControl>
                      <Input className={'font-jetbrains'} placeholder={'shulkr/'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          <div className={'mt-4 space-y-2'}>
            <Button
              type={'button'}
              variant={'outline'}
              onClick={handleTest}
              disabled={testMutation.isPending}
              className={'w-full sm:w-auto'}
            >
              {testMutation.isPending ? (
                <Loader2 className={'size-4 animate-spin'} />
              ) : (
                <Check className={'size-4'} />
              )}
              {t('cloudDestinations.test')}
            </Button>
            {testResult && <TestResultDisplay result={testResult} />}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'cloud-destination-form'} loading={isPending} disabled={isPending}>
            {isEdit ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestResultDisplay({ result }: { result: TestConnectionResult }) {
  const { t } = useTranslation();
  const allOk = result.auth && result.list && result.write;
  return (
    <div
      className={
        allOk
          ? 'rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400'
          : 'rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400'
      }
    >
      <div className={'flex items-center gap-4'}>
        <TestLine label={t('cloudDestinations.test.auth')} ok={result.auth} />
        <TestLine label={t('cloudDestinations.test.list')} ok={result.list} />
        <TestLine label={t('cloudDestinations.test.write')} ok={result.write} />
      </div>
      {result.error && <div className={'mt-1.5 text-xs opacity-80'}>{result.error}</div>}
    </div>
  );
}

function TestLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={'flex items-center gap-1.5 text-xs'}>
      {ok ? <Check className={'size-3.5'} /> : <X className={'size-3.5'} />}
      {label}
    </span>
  );
}
