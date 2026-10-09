import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
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
import { Label } from '@shulkr/frontend/features/ui/base/label';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { useDeleteDatabase } from '@shulkr/frontend/hooks/use_databases';
import type { ServerDatabaseResponse } from '@shulkr/shared';

export function DeleteDatabaseDialog({
  open,
  onOpenChange,
  database,
  serverId,
}: {
  open: boolean;
  onOpenChange: () => void;
  database: ServerDatabaseResponse;
  serverId: string;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState('');
  const deleteDatabase = useDeleteDatabase(serverId);
  const matches = confirmation === database.dbName;

  const handleClose = () => {
    setConfirmation('');
    onOpenChange();
  };

  const handleDelete = async () => {
    await deleteDatabase.mutateAsync({ id: database.id, confirmation });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{t('databases.dialog.deleteTitle')}</DialogTitle>
          <DialogDescription>{t('databases.dialog.deleteDescription', { name: database.dbName })}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className={'space-y-4'}>
            <p
              className={
                'flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400'
              }
            >
              <TriangleAlert className={'mt-0.5 size-4 shrink-0'} />
              <span>{t('databases.dialog.deleteWarning')}</span>
            </p>
            <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('databases.dialog.deleteDumpNotice')}</p>
            <div className={'space-y-2'}>
              <Label htmlFor={'delete-database-confirmation'}>
                {t('databases.dialog.deleteConfirmLabel', { name: database.dbName })}
              </Label>
              <Input
                id={'delete-database-confirmation'}
                autoFocus
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={database.dbName}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={handleClose} variant={'ghost'} disabled={deleteDatabase.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant={'destructive'} onClick={handleDelete} disabled={!matches} loading={deleteDatabase.isPending}>
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
