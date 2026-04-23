import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';

export function FirewallGuidelinesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.firewall.infoTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={'divide-y divide-black/4 dark:divide-white/6'}>
            <div className={'pb-3'}>
              <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
                {t('settings.firewall.infoPortRangeLabel')}
              </p>
              <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.firewall.infoPortRangeDesc')}</p>
            </div>
            <div className={'py-3'}>
              <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>
                {t('settings.firewall.infoReservedPortsLabel')}
              </p>
              <div className={'mt-1.5 flex flex-wrap gap-1.5'}>
                {[22, 80, 443, 3000, 3001].map((port) => (
                  <Badge key={port} variant={'secondary'} className={'font-jetbrains'}>
                    {port}
                  </Badge>
                ))}
              </div>
            </div>
            <div className={'py-3'}>
              <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('settings.firewall.infoProtocolLabel')}</p>
              <p className={'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400'}>{t('settings.firewall.infoProtocolDesc')}</p>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant={'ghost'}>{t('common.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
