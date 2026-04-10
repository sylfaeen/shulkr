import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { FileTreeSelector, type TreeNode } from '@shulkr/frontend/features/ui/file_tree_selector';

export function CreateBackupDialog({
  open,
  serverId,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  serverId: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (paths: Array<string>) => void;
}) {
  const { t } = useTranslation();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const treeRef = useRef<Array<TreeNode>>([]);

  const handleConfirm = () => {
    onConfirm(FileTreeSelector.optimizeSelectedPaths(treeRef.current, selectedPaths));
  };

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      {...{ open }}
    >
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('backups.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('backups.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FileTreeSelector
            enabled={open}
            selectedPaths={selectedPaths}
            onSelectedPathsChange={setSelectedPaths}
            {...{ serverId, treeRef }}
          />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant={'secondary'} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} loading={isPending} disabled={selectedPaths.size === 0 || isPending}>
            {isPending ? t('backups.backingUp') : t('backups.startBackup')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
