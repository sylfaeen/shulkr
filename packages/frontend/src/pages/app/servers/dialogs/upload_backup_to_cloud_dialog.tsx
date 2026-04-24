import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CloudUpload } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/base/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@shulkr/frontend/features/ui/base/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import type { CloudDestinationResponse } from '@shulkr/shared';

const schema = z.object({
  cloudDestinationId: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function UploadBackupToCloudDialog({
  open,
  filename,
  destinations,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  filename: string | null;
  destinations: Array<CloudDestinationResponse>;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (cloudDestinationId: string) => void;
}) {
  const { t } = useTranslation();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cloudDestinationId: destinations[0]?.id ?? '' },
  });
  useEffect(() => {
    if (open) form.reset({ cloudDestinationId: destinations[0]?.id ?? '' });
  }, [open, destinations, form]);
  const handleSubmit = (values: FormValues) => {
    onConfirm(values.cloudDestinationId);
  };
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('backups.uploadToCloud.title')}</DialogTitle>
          <DialogDescription>
            {filename ? t('backups.uploadToCloud.description', { filename }) : t('backups.uploadToCloud.descriptionNoFilename')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={'upload-backup-to-cloud-form'} onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogBody>
              <FormField
                control={form.control}
                name={'cloudDestinationId'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('backups.uploadToCloud.destination')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('backups.uploadToCloud.selectDestination')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {destinations.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} ({d.bucket})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button type={'button'} variant={'ghost'} onClick={onClose} disabled={isPending}>
                {t('common.cancel')}
              </Button>
              <Button
                type={'submit'}
                form={'upload-backup-to-cloud-form'}
                loading={isPending}
                disabled={isPending}
                icon={CloudUpload}
              >
                {t('backups.uploadToCloud.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
