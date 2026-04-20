import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { AlertForm, type AlertFormValues } from '@shulkr/frontend/pages/app/servers/features/alert_form';

const DEFAULT_VALUES: AlertFormValues = {
  name: '',
  metric: 'cpu',
  operator: '>=',
  threshold: 90,
  actions: ['notify'],
};

export function CreateAlertDialog({
  serverId,
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AlertFormValues) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AlertFormValues>({ ...DEFAULT_VALUES });
  const handleSubmit = async () => {
    await onSubmit(values);
    setValues({ ...DEFAULT_VALUES });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('alerts.createTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AlertForm {...{ serverId, values }} onChange={setValues} />
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!values.name || values.actions.length === 0 || isLoading} loading={isLoading}>
            {t('alerts.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
