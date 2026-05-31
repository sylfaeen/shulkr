import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Clock, Link2, Trash2, User } from 'lucide-react';
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
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import { cn } from '@shulkr/frontend/lib/cn';
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from '@shulkr/frontend/hooks/use_backups';
import { formatRelativeDate } from '@shulkr/frontend/lib/date';

export function ShareBackupDialog({ open, filename, onClose }: { open: boolean; filename: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [retained, setRetained] = useState<string | null>(filename);

  // Keep the last filename during the close animation so the body does not flash empty before the dialog finishes closing.
  useEffect(() => {
    if (filename) setRetained(filename);
  }, [filename]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('backups.share.title')}</DialogTitle>
          <DialogDescription>
            {retained ? t('backups.share.description', { filename: retained }) : t('backups.share.descriptionNoFilename')}
          </DialogDescription>
        </DialogHeader>
        {retained && <ShareDialogBody filename={retained} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({ filename, onClose }: { filename: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: links } = useShareLinks(filename);
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink(filename);

  const schema = z.object({
    expiry: z.string(),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { expiry: '24' },
  });

  const presets = [
    { value: 'never', label: t('backups.share.expiry.never') },
    { value: '1', label: t('backups.share.expiry.1h') },
    { value: '24', label: t('backups.share.expiry.24h') },
    { value: '168', label: t('backups.share.expiry.7d') },
    { value: '720', label: t('backups.share.expiry.30d') },
  ];

  const handleSubmit = async (values: FormValues) => {
    await createLink.mutateAsync({
      filename,
      expiresInHours: values.expiry === 'never' ? null : Number(values.expiry),
    });
  };

  return (
    <>
      <DialogBody className={'gap-4'}>
        <Form {...form}>
          <form id={'share-backup-form'} onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name={'expiry'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('backups.share.expiryLabel')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={createLink.isPending} modal={false}>
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
          </form>
        </Form>
        {links && links.length > 0 && (
          <div className={'flex flex-col gap-2'}>
            <span className={'text-sm font-medium text-zinc-500 dark:text-zinc-400'}>{t('backups.share.activeLinks')}</span>
            {links.map((link) => (
              <ShareLinkRow
                key={link.id}
                link={link}
                onRevoke={() => revokeLink.mutate({ id: link.id })}
                revoking={revokeLink.isPending}
              />
            ))}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type={'button'} variant={'ghost'} onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button type={'submit'} form={'share-backup-form'} loading={createLink.isPending} disabled={createLink.isPending} icon={Link2}>
          {t('backups.share.createButton')}
        </Button>
      </DialogFooter>
    </>
  );
}

function ShareLinkRow({
  link,
  onRevoke,
  revoking,
}: {
  link: {
    id: number;
    url: string;
    createdByUsername: string | null;
    createdAt: string;
    expiresAt: string | null;
    revoked: boolean;
    downloadCount: number;
    lastDownloadedAt: string | null;
  };
  onRevoke: () => void;
  revoking: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}${link.url}`;
  const isExpired = link.expiresAt !== null && new Date(link.expiresAt).getTime() < Date.now();
  const inactive = link.revoked || isExpired;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700', inactive && 'opacity-60')}>
      <div className={'flex items-center gap-2'}>
        <Input readOnly value={fullUrl} className={'font-jetbrains h-8 text-xs'} onFocusCapture={(e) => e.currentTarget.select()} />
        <Button
          type={'button'}
          variant={'secondary'}
          size={'icon-sm'}
          onClick={handleCopy}
          disabled={inactive}
          icon={copied ? Check : Copy}
          iconClass={cn(copied && 'text-green-600')}
        />
        {!inactive && (
          <Button type={'button'} variant={'ghost-destructive'} size={'icon-sm'} onClick={onRevoke} loading={revoking} disabled={revoking} icon={Trash2} />
        )}
      </div>
      <div className={'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400'}>
        {link.revoked && <Badge variant={'outline'}>{t('backups.share.statusRevoked')}</Badge>}
        {!link.revoked && isExpired && <Badge variant={'outline'}>{t('backups.share.statusExpired')}</Badge>}
        <span className={'flex items-center gap-1'}>
          <User className={'size-3'} strokeWidth={2} />
          {link.createdByUsername ?? t('backups.share.unknownUser')}
        </span>
        <span className={'text-zinc-300 dark:text-zinc-700'}>·</span>
        <span>{t('backups.share.createdOn', { date: formatRelativeDate(link.createdAt) })}</span>
        <span className={'text-zinc-300 dark:text-zinc-700'}>·</span>
        <span className={'flex items-center gap-1'}>
          <Clock className={'size-3'} strokeWidth={2} />
          {link.expiresAt
            ? t('backups.share.expiresOn', { date: formatRelativeDate(link.expiresAt) })
            : t('backups.share.neverExpires')}
        </span>
        <span className={'text-zinc-300 dark:text-zinc-700'}>·</span>
        <span>{t('backups.share.downloads', { count: link.downloadCount })}</span>
      </div>
    </div>
  );
}
