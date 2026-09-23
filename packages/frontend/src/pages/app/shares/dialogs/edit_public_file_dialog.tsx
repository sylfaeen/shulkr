import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { PUBLIC_FILE_DEFAULT_EXPIRY_HOURS, PUBLIC_FILE_MAX_DOWNLOADS, type PublicFile } from '@shulkr/shared';
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
import { useUpdatePublicFile } from '@shulkr/frontend/hooks/use_public_files';
import { NEVER, parseExpiry, useExpiryPresets } from '@shulkr/frontend/pages/app/shares/features/expiry';

export function EditPublicFileDialog({ file, onClose }: { file: PublicFile; onClose: () => void }) {
  const { t } = useTranslation();
  const presets = useExpiryPresets();
  const update = useUpdatePublicFile();

  const schema = z.object({
    expiry: z.string(),
    maxDownloads: z.union([z.literal(''), z.coerce.number().int().min(1).max(PUBLIC_FILE_MAX_DOWNLOADS)]),
  });

  type FormValues = z.input<typeof schema>;
  type ParsedValues = z.output<typeof schema>;

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      expiry: file.expiresAt === null ? NEVER : String(PUBLIC_FILE_DEFAULT_EXPIRY_HOURS),
      maxDownloads: file.maxDownloads === null ? '' : file.maxDownloads,
    },
  });

  const handleSubmit = async (values: ParsedValues) => {
    await update.mutateAsync({
      id: file.id,
      body: {
        expiresInHours: parseExpiry(values.expiry),
        maxDownloads: values.maxDownloads === '' ? null : values.maxDownloads,
      },
    });

    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shares.edit.title')}</DialogTitle>
          <DialogDescription>{t('shares.edit.description', { name: file.name })}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogBody className={'gap-4'}>
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
                    <FormDescription>{t('shares.edit.expiryFromNow')}</FormDescription>
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
                    <FormDescription>{t('shares.edit.downloadsSoFar', { count: file.downloadCount })}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button type={'button'} variant={'ghost'} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type={'submit'} icon={Save} loading={update.isPending} disabled={update.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
