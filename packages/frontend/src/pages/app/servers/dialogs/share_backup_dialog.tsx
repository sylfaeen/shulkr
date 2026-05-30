import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('backups.share.title')}</DialogTitle>
          <DialogDescription>
            {filename ? t('backups.share.description', { filename }) : t('backups.share.descriptionNoFilename')}
          </DialogDescription>
        </DialogHeader>
        {filename && <ShareDialogBody filename={filename} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({ filename, onClose }: { filename: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: links } = useShareLinks(filename);
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink(filename);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const schema = z.object({
    expiresInHours: z.coerce.number().int().min(1),
  });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { expiresInHours: 24 },
  });

  const presets = [
    { hours: 1, label: t('backups.share.expiry.1h') },
    { hours: 24, label: t('backups.share.expiry.24h') },
    { hours: 168, label: t('backups.share.expiry.7d') },
    { hours: 720, label: t('backups.share.expiry.30d') },
  ];

  const handleSubmit = async (values: FormValues) => {
    const result = await createLink.mutateAsync({ filename, expiresInHours: values.expiresInHours });

    setCreatedUrl(`${window.location.origin}${result.url}`);
  };

  return (
    <>
      <DialogBody className={'gap-4'}>
        {createdUrl && <CreatedLinkBanner url={createdUrl} />}
        <Form {...form}>
          <form id={'share-backup-form'} onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name={'expiresInHours'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('backups.share.expiryLabel')}</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                    disabled={createLink.isPending}
                    modal={false}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {presets.map((preset) => (
                        <SelectItem key={preset.hours} value={String(preset.hours)}>
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
          <div className={'flex flex-col gap-1.5'}>
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

function CreatedLinkBanner({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={'flex flex-col gap-1.5 rounded-lg border border-green-300 bg-green-50 p-3 dark:border-green-900 dark:bg-green-500/10'}>
      <span className={'text-sm font-medium text-green-800 dark:text-green-300'}>{t('backups.share.created')}</span>
      <div className={'flex items-center gap-2'}>
        <Input readOnly value={url} className={'font-jetbrains h-8 text-xs'} onFocus={(e) => e.target.select()} />
        <Button
          type={'button'}
          variant={'secondary'}
          size={'icon-sm'}
          onClick={handleCopy}
          icon={copied ? Check : Copy}
          iconClass={cn(copied && 'text-green-600')}
        />
      </div>
    </div>
  );
}

function ShareLinkRow({
  link,
  onRevoke,
  revoking,
}: {
  link: {
    id: number;
    preview: string;
    createdAt: string;
    expiresAt: string;
    revoked: boolean;
    downloadCount: number;
    lastDownloadedAt: string | null;
  };
  onRevoke: () => void;
  revoking: boolean;
}) {
  const { t } = useTranslation();
  const isExpired = new Date(link.expiresAt).getTime() < Date.now();
  const inactive = link.revoked || isExpired;

  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700', inactive && 'opacity-60')}>
      <div className={'flex min-w-0 flex-col'}>
        <div className={'flex items-center gap-2'}>
          <span className={'font-jetbrains text-sm text-zinc-700 dark:text-zinc-300'}>{link.preview}…</span>
          {link.revoked && <Badge variant={'outline'}>{t('backups.share.statusRevoked')}</Badge>}
          {!link.revoked && isExpired && <Badge variant={'outline'}>{t('backups.share.statusExpired')}</Badge>}
        </div>
        <span className={'text-xs text-zinc-500 dark:text-zinc-400'}>
          {t('backups.share.expiresOn', { date: formatRelativeDate(link.expiresAt) })} ·{' '}
          {t('backups.share.downloads', { count: link.downloadCount })}
        </span>
      </div>
      {!inactive && (
        <Button
          type={'button'}
          variant={'ghost-destructive'}
          size={'icon-sm'}
          onClick={onRevoke}
          loading={revoking}
          disabled={revoking}
          icon={Trash2}
        />
      )}
    </div>
  );
}
