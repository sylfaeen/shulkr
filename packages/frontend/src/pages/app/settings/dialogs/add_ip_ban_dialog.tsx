import { useEffect } from 'react';
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
import { Textarea } from '@shulkr/frontend/features/ui/base/textarea';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/base/form';
import { ipAddressSchema } from '@shulkr/shared';

type AddIpBanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: { ip: string; reason?: string; player_name?: string }) => void;
  defaultValues?: { ip?: string; reason?: string; player_name?: string };
};

export function AddIpBanDialog({ open, onOpenChange, onAdd, defaultValues }: AddIpBanDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.ipBans.addBan')}</DialogTitle>
          <DialogDescription>{t('settings.ipBans.addBanDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CreateIpBanForm {...{ onAdd, defaultValues, open }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant={'secondary'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'add-ip-ban'}>
            {t('settings.ipBans.addBan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateIpBanForm({
  onAdd,
  defaultValues,
  open,
}: Pick<AddIpBanDialogProps, 'onAdd' | 'defaultValues'> & { open: boolean }) {
  const { t } = useTranslation();

  const schema = z.object({
    ip: ipAddressSchema,
    reason: z.string().max(500).optional(),
    player_name: z.string().max(64).optional(),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ip: defaultValues?.ip ?? '',
      reason: defaultValues?.reason ?? '',
      player_name: defaultValues?.player_name ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        ip: defaultValues?.ip ?? '',
        reason: defaultValues?.reason ?? '',
        player_name: defaultValues?.player_name ?? '',
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (data: FormValues) => {
    onAdd({
      ip: data.ip.trim(),
      reason: data.reason?.trim() || undefined,
      player_name: data.player_name?.trim() || undefined,
    });
    form.reset();
  };

  const reasonValue = form.watch('reason') ?? '';

  return (
    <Form {...form}>
      <form id={'add-ip-ban'} className={'space-y-4'} onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name={'ip'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.ipBans.ip')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={'192.168.1.42'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'player_name'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.ipBans.playerName')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={t('settings.ipBans.playerNamePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={'reason'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.ipBans.reason')}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder={t('settings.ipBans.reasonPlaceholder')} {...field} />
              </FormControl>
              <div className={'flex justify-end text-xs text-zinc-500'}>{reasonValue.length}/500</div>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
