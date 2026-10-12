import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, X } from 'lucide-react';
import {
  PUBLIC_FILE_DEFAULT_EXPIRY_HOURS,
  PUBLIC_FILE_MAX_BYTES,
  PUBLIC_FILE_MAX_DOWNLOADS,
  type PublicFile,
} from '@shulkr/shared';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/base/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shulkr/frontend/features/ui/base/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Progress } from '@shulkr/frontend/features/ui/base/progress';
import { usePublicFileUpload } from '@shulkr/frontend/hooks/use_public_files';
import { formatBytes, parseExpiry, useExpiryPresets } from '@shulkr/frontend/pages/app/shares/features/expiry';

// Without replaceFile the dialog creates a new share. With it, the chosen file takes over that share: same URL, new content and new SHA-1.
export function UploadPublicFileDialog({ replaceFile, onClose }: { replaceFile?: PublicFile; onClose: () => void }) {
  const { t } = useTranslation();
  const { upload, cancel, state } = usePublicFileUpload();

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (state) cancel();
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{replaceFile ? t('shares.replace.title') : t('shares.upload.title')}</DialogTitle>
          <DialogDescription>
            {replaceFile
              ? t('shares.replace.description', { name: replaceFile.name })
              : t('shares.upload.description', { size: formatBytes(PUBLIC_FILE_MAX_BYTES) })}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <UploadProgress {...{ state }} onCancel={cancel} />
        ) : (
          <UploadForm
            onSubmit={async (file, expiresInHours, maxDownloads) => {
              const target = replaceFile
                ? { kind: 'replace' as const, fileId: replaceFile.id }
                : { kind: 'new' as const, expiresInHours, maxDownloads };

              if (await upload(file, target)) onClose();
            }}
            onCancel={onClose}
            withLimits={!replaceFile}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadForm({
  withLimits,
  onSubmit,
  onCancel,
}: {
  withLimits: boolean;
  onSubmit: (file: File, expiresInHours: number | null, maxDownloads: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const presets = useExpiryPresets();

  const schema = z.object({
    file: z
      .instanceof(File, { message: t('shares.upload.fileRequired') })
      .refine((f) => f.size > 0, t('shares.upload.fileEmpty'))
      .refine(
        (f) => f.size <= PUBLIC_FILE_MAX_BYTES,
        t('shares.upload.fileTooLarge', { size: formatBytes(PUBLIC_FILE_MAX_BYTES) })
      ),
    expiry: z.string(),
    maxDownloads: z.union([z.literal(''), z.coerce.number().int().min(1).max(PUBLIC_FILE_MAX_DOWNLOADS)]),
  });

  type FormValues = z.input<typeof schema>;
  type ParsedValues = z.output<typeof schema>;

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(schema),
    defaultValues: { file: undefined, expiry: String(PUBLIC_FILE_DEFAULT_EXPIRY_HOURS), maxDownloads: '' },
  });

  const handleSubmit = async (values: ParsedValues) => {
    await onSubmit(values.file, parseExpiry(values.expiry), values.maxDownloads === '' ? null : values.maxDownloads);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <DialogBody className={'gap-4'}>
          <FormField
            control={form.control}
            name={'file'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('shares.upload.file')}</FormLabel>
                <FormControl>
                  <Input
                    type={'file'}
                    name={field.name}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    onChange={(e) => field.onChange(e.target.files?.[0])}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {withLimits && (
            <>
              <FormField
                control={form.control}
                name={'expiry'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('shares.expiry.label')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} modal={false}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>{(value: string) => presets.find((p) => p.value === value)?.label ?? value}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {presets.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
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
                name={'maxDownloads'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('shares.maxDownloads.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type={'number'}
                        min={1}
                        placeholder={t('shares.maxDownloads.placeholder')}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>{t('shares.maxDownloads.help')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type={'button'} variant={'ghost'} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} icon={Upload} loading={form.formState.isSubmitting} disabled={form.formState.isSubmitting}>
            {t('shares.upload.submit')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function UploadProgress({
  state,
  onCancel,
}: {
  state: { name: string; sentBytes: number; totalBytes: number };
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const percent = Math.round((state.sentBytes / state.totalBytes) * 100);

  return (
    <>
      <DialogBody className={'gap-3'}>
        <p className={'truncate text-sm font-medium'}>{state.name}</p>
        <Progress value={percent} />
        <p className={'text-xs text-zinc-500 dark:text-zinc-400'}>
          {t('shares.upload.progress', { sent: formatBytes(state.sentBytes), total: formatBytes(state.totalBytes), percent })}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button type={'button'} variant={'ghost'} icon={X} onClick={onCancel}>
          {t('shares.upload.cancel')}
        </Button>
      </DialogFooter>
    </>
  );
}
