import { useEffect, useRef, useState } from 'react';
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
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Form, FormField } from '@shulkr/frontend/features/ui/base/form';
import { FileTreeSelector, type TreeNode } from '@shulkr/frontend/features/ui/file_tree_selector';
import { DatabaseSelector } from '@shulkr/frontend/features/ui/database_selector';

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
  onConfirm: (paths: Array<string>, databaseIds: Array<number> | undefined) => void;
}) {
  const { t } = useTranslation();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const treeRef = useRef<Array<TreeNode>>([]);
  const schema = z.object({ databaseIds: z.array(z.number()).optional() });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { databaseIds: undefined } });
  const databaseIds = form.watch('databaseIds');

  useEffect(() => {
    if (!open) form.reset({ databaseIds: undefined });
  }, [open, form]);

  const handleConfirm = (data: FormValues) => {
    onConfirm(FileTreeSelector.optimizeSelectedPaths(treeRef.current, selectedPaths), data.databaseIds);
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
          <Form {...form}>
            <form id={'create-backup-form'} className={'space-y-4'} onSubmit={form.handleSubmit(handleConfirm)}>
              <FileTreeSelector
                enabled={open}
                selectedPaths={selectedPaths}
                onSelectedPathsChange={setSelectedPaths}
                {...{ serverId, treeRef }}
              />
              <FormField
                control={form.control}
                name={'databaseIds'}
                render={({ field }) => <DatabaseSelector value={field.value} onChange={field.onChange} {...{ serverId }} />}
              />
            </form>
          </Form>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} variant={'ghost'} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            type={'submit'}
            form={'create-backup-form'}
            loading={isPending}
            disabled={(selectedPaths.size === 0 && (databaseIds?.length ?? 0) === 0) || isPending}
          >
            {isPending ? t('backups.backingUp') : t('backups.startBackup')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
