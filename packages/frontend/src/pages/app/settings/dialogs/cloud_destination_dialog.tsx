import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Cloud, ExternalLink, HardDrive, Server, X, Zap } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shulkr/frontend/features/ui/shadcn/form';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { cn } from '@shulkr/frontend/lib/cn';
import {
  useCreateCloudDestination,
  useUpdateCloudDestination,
  useTestCloudDestination,
} from '@shulkr/frontend/hooks/use_cloud_destinations';
import type { CloudDestinationResponse, CloudProvider, TestConnectionResult } from '@shulkr/shared';

type ProviderPreset = {
  provider: CloudProvider;
  icon: typeof Cloud;
  accentClass: string;
  defaultRegion: string;
  defaultEndpoint: string;
  endpointPlaceholder?: string;
  credentialsUrl?: string;
  regionHint?: string;
};

const PROVIDER_PRESETS: Record<CloudProvider, ProviderPreset> = {
  'aws-s3': {
    provider: 'aws-s3',
    icon: Cloud,
    accentClass: 'border-amber-500/40 bg-amber-500/5',
    defaultRegion: 'us-east-1',
    defaultEndpoint: 'https://s3.amazonaws.com',
    credentialsUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    regionHint: 'e.g. us-east-1, eu-west-1, ap-southeast-1',
  },
  'cloudflare-r2': {
    provider: 'cloudflare-r2',
    icon: Zap,
    accentClass: 'border-orange-500/40 bg-orange-500/5',
    defaultRegion: 'auto',
    defaultEndpoint: 'https://<account-id>.r2.cloudflarestorage.com',
    endpointPlaceholder: 'https://<account-id>.r2.cloudflarestorage.com',
    credentialsUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
    regionHint: 'Use "auto" for R2',
  },
  'backblaze-b2': {
    provider: 'backblaze-b2',
    icon: HardDrive,
    accentClass: 'border-red-500/40 bg-red-500/5',
    defaultRegion: 'us-west-004',
    defaultEndpoint: 'https://s3.us-west-004.backblazeb2.com',
    credentialsUrl: 'https://secure.backblaze.com/app_keys.htm',
    regionHint: 'Your bucket region (see Backblaze console)',
  },
  wasabi: {
    provider: 'wasabi',
    icon: HardDrive,
    accentClass: 'border-green-500/40 bg-green-500/5',
    defaultRegion: 'us-east-1',
    defaultEndpoint: 'https://s3.wasabisys.com',
    credentialsUrl: 'https://console.wasabisys.com/',
    regionHint: 'e.g. us-east-1, eu-central-1',
  },
  'minio-custom': {
    provider: 'minio-custom',
    icon: Server,
    accentClass: 'border-sky-500/40 bg-sky-500/5',
    defaultRegion: 'us-east-1',
    defaultEndpoint: '',
    endpointPlaceholder: 'https://minio.example.com',
    regionHint: 'Typically us-east-1 for MinIO',
  },
};

const PROVIDERS_ORDER: Array<CloudProvider> = ['aws-s3', 'cloudflare-r2', 'backblaze-b2', 'wasabi', 'minio-custom'];

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
  const form = useForm<FormValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: {
      name: destination?.name ?? '',
      provider: destination?.provider ?? 'aws-s3',
      endpoint: destination?.endpoint ?? PROVIDER_PRESETS['aws-s3'].defaultEndpoint,
      region: destination?.region ?? PROVIDER_PRESETS['aws-s3'].defaultRegion,
      bucket: destination?.bucket ?? '',
      accessKeyId: destination?.accessKeyId ?? '',
      secretAccessKey: '',
      prefix: destination?.prefix ?? '',
    },
  });
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const currentProvider = form.watch('provider');
  const currentPreset = PROVIDER_PRESETS[currentProvider];
  const handleProviderChange = (provider: CloudProvider) => {
    form.setValue('provider', provider);
    if (!isEdit) {
      const preset = PROVIDER_PRESETS[provider];
      form.setValue('endpoint', preset.defaultEndpoint);
      form.setValue('region', preset.defaultRegion);
    }
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
              <FormItem>
                <FormLabel>{t('cloudDestinations.fields.provider')}</FormLabel>
                <FormControl>
                  <div className={'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
                    {PROVIDERS_ORDER.map((p) => {
                      const preset = PROVIDER_PRESETS[p];
                      const Icon = preset.icon;
                      const active = currentProvider === p;
                      return (
                        <button
                          key={p}
                          type={'button'}
                          onClick={() => handleProviderChange(p)}
                          className={cn(
                            'rounded-lg border p-3 text-left transition-all',
                            active
                              ? preset.accentClass
                              : 'border-black/6 bg-zinc-50/50 text-zinc-600 hover:border-black/12 hover:bg-zinc-50 dark:border-white/6 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:border-white/12 dark:hover:bg-zinc-800'
                          )}
                        >
                          <Icon
                            className={cn(
                              'mb-2 size-4 transition-colors',
                              active ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400'
                            )}
                            strokeWidth={2}
                          />
                          <div
                            className={cn(
                              'text-sm font-medium',
                              active ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'
                            )}
                          >
                            {t(`cloudDestinations.providers.${p}`)}
                          </div>
                          <div className={'mt-0.5 text-xs text-zinc-600 dark:text-zinc-400'}>
                            {t(`cloudDestinations.providerHints.${p}`)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
              </FormItem>
              <div className={'grid items-start gap-4 sm:grid-cols-2'}>
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
                <FormField
                  control={form.control}
                  name={'region'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cloudDestinations.fields.region')}</FormLabel>
                      <FormControl>
                        <Input placeholder={currentPreset.defaultRegion} {...field} />
                      </FormControl>
                      {currentPreset.regionHint && <FormDescription>{currentPreset.regionHint}</FormDescription>}
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
                    <FormLabel className={'flex items-center justify-between'}>
                      <span>{t('cloudDestinations.fields.accessKeyId')}</span>
                      {currentPreset.credentialsUrl && (
                        <a
                          href={currentPreset.credentialsUrl}
                          target={'_blank'}
                          rel={'noreferrer'}
                          className={'flex items-center gap-1 text-xs font-normal text-sky-600 hover:underline dark:text-sky-400'}
                        >
                          {t('cloudDestinations.fields.credentialsGuide')}
                          <ExternalLink className={'size-3'} />
                        </a>
                      )}
                    </FormLabel>
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
                    <FormLabel>{t('cloudDestinations.fields.secretAccessKey')}</FormLabel>
                    <FormControl>
                      <Input type={'password'} className={'font-jetbrains'} {...field} />
                    </FormControl>
                    {isEdit && <FormDescription>{t('cloudDestinations.fields.leaveBlankToKeep')}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={'pt-1'}>
                <button
                  type={'button'}
                  onClick={() => setShowAdvanced((v) => !v)}
                  className={'text-xs font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}
                >
                  {showAdvanced ? t('cloudDestinations.hideAdvanced') : t('cloudDestinations.showAdvanced')}
                </button>
              </div>
              {showAdvanced && (
                <div
                  className={
                    'space-y-4 rounded-lg border border-black/6 bg-zinc-50/50 p-3 dark:border-white/6 dark:bg-zinc-900/30'
                  }
                >
                  <FormField
                    control={form.control}
                    name={'endpoint'}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('cloudDestinations.fields.endpoint')}</FormLabel>
                        <FormControl>
                          <Input
                            className={'font-jetbrains'}
                            placeholder={currentPreset.endpointPlaceholder ?? currentPreset.defaultEndpoint}
                            {...field}
                          />
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
                        <FormDescription>{t('cloudDestinations.fields.prefixHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </form>
          </Form>
          <div className={'mt-4 space-y-2'}>
            <Button
              type={'button'}
              variant={'secondary'}
              onClick={handleTest}
              loading={testMutation.isPending}
              disabled={testMutation.isPending}
              icon={Check}
            >
              {t('cloudDestinations.testConnection')}
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
          ? 'rounded-md border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-700 dark:text-green-400'
          : 'rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400'
      }
    >
      <div className={'flex items-center gap-4'}>
        <TestLine label={t('cloudDestinations.testResults.auth')} ok={result.auth} />
        <TestLine label={t('cloudDestinations.testResults.list')} ok={result.list} />
        <TestLine label={t('cloudDestinations.testResults.write')} ok={result.write} />
      </div>
      {result.error && <div className={'mt-1.5 opacity-80'}>{result.error}</div>}
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
