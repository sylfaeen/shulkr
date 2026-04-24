import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Save } from 'lucide-react';

export function BackupSettingsDialog({
  open,
  onOpenChange,
  currentMaxBackups,
  isPending,
  onClose,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMaxBackups: number;
  isPending: boolean;
  onClose: () => void;
  onSave: (maxBackups: number) => void;
}) {
  const { t } = useTranslation();
  const backupSettingsSchema = z.object({
    max_backups: z.coerce.number().int().min(0).max(100),
  });
  type BackupSettingsFormValues = z.infer<typeof backupSettingsSchema>;
  const form = useForm<BackupSettingsFormValues>({
    resolver: zodResolver(backupSettingsSchema),
    defaultValues: { max_backups: currentMaxBackups },
  });
  const handleSubmit = (data: BackupSettingsFormValues) => {
    onSave(data.max_backups);
  };
  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('backups.settings.title')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogBody>
              <FormField
                control={form.control}
                name={'max_backups'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('backups.settings.maxBackups')}</FormLabel>
                    <FormControl>
                      <Input type={'number'} min={0} max={100} {...field} />
                    </FormControl>
                    <FormDescription>{t('backups.settings.maxBackupsDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose} variant={'ghost'} disabled={isPending}>
                {t('common.cancel')}
              </Button>
              <Button type={'submit'} loading={isPending} disabled={isPending} icon={Save}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
