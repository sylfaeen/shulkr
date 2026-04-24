import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useWebhookDeliveries } from '@shulkr/frontend/hooks/use_webhooks';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/base/dialog';

export function DeliveriesDialog({ serverId, webhookId, onClose }: { serverId: string; webhookId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWebhookDeliveries(serverId, webhookId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{t('webhooks.deliveries')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <div className={'flex items-center justify-center py-8'}>
              <Loader2 className={'size-5 animate-spin text-zinc-400'} />
            </div>
          ) : !data?.deliveries.length ? (
            <p className={'py-8 text-center text-sm text-zinc-500'}>{t('webhooks.noDeliveries')}</p>
          ) : (
            <div className={'max-h-80 space-y-1 overflow-y-auto'}>
              {data.deliveries.map((d) => (
                <div
                  key={d.id}
                  className={'flex items-center justify-between rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}
                >
                  <div className={'flex items-center gap-2'}>
                    {d.status === 'success' ? (
                      <CheckCircle2 className={'size-4 text-green-500'} />
                    ) : (
                      <XCircle className={'size-4 text-red-500'} />
                    )}
                    <span className={'text-sm'}>{d.event}</span>
                  </div>
                  <div className={'flex items-center gap-2'}>
                    {d.statusCode !== null && (
                      <Badge variant={d.status === 'success' ? 'secondary' : 'destructive'}>{d.statusCode}</Badge>
                    )}
                    {d.durationMs !== null && <span className={'text-xs text-zinc-500'}>{d.durationMs}ms</span>}
                    <span className={'text-xs text-zinc-400'}>{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
