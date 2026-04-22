import { useTranslation } from 'react-i18next';
import { OctagonAlert } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';

export function MergeWarningDialog({
  totalLines,
  isPending,
  onSplit,
  onForce,
  onCancel,
}: {
  totalLines: number;
  isPending: boolean;
  onSplit: () => void;
  onForce: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className={'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{t('logs.mergeWarningTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Alert variant={'warning'}>
            <OctagonAlert className={'size-4'} />
            <AlertDescription>{t('logs.mergeWarningDescription', { totalLines: totalLines.toLocaleString() })}</AlertDescription>
          </Alert>
        </DialogBody>
        <DialogFooter>
          <div className={'flex w-full flex-col gap-2'}>
            <Button onClick={onSplit} className={'w-full'} loading={isPending} disabled={isPending}>
              {t('logs.mergeWithSplit')}
            </Button>
            <Button onClick={onForce} variant={'secondary'} className={'w-full'} loading={isPending} disabled={isPending}>
              {t('logs.mergeWithoutSplit')}
            </Button>
            <Button onClick={onCancel} variant={'ghost'} className={'w-full'} disabled={isPending}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
