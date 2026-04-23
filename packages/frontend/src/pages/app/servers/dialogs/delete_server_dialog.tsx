import type { ServerResponse } from '@shulkr/shared';
import { useTranslation } from 'react-i18next';
import { OctagonAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';

export function DeleteServerDialog({
  server,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  server: ServerResponse;
  isDeleting: boolean;
  onConfirm: (createBackup: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isRunning = server.status === 'running';
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className={'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{t('servers.deleteServer')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className={'text-zinc-600 dark:text-zinc-400'}>{t('servers.deleteConfirmMessage', { name: server.name })}</p>
          <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('servers.deleteWarningFolder')}</p>
          {isRunning && (
            <Alert variant={'destructive'}>
              <OctagonAlert className={'size-4'} />
              <AlertDescription>{t('servers.deleteMustBeStopped')}</AlertDescription>
            </Alert>
          )}
          {!isRunning && (
            <Alert variant={'info'}>
              <OctagonAlert className={'size-4'} />
              <AlertDescription>{t('servers.backupQuestion')}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <div className={'flex w-full flex-col gap-2'}>
            <Button onClick={() => onConfirm(true)} className={'w-full'} disabled={isDeleting || isRunning}>
              {t('servers.deleteWithBackup')}
            </Button>
            <Button
              onClick={() => onConfirm(false)}
              variant={'destructive'}
              className={'w-full'}
              loading={isDeleting}
              disabled={isDeleting || isRunning}
            >
              {t('servers.deleteWithoutBackup')}
            </Button>
            <Button onClick={onCancel} variant={'ghost'} className={'w-full'} disabled={isDeleting}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
