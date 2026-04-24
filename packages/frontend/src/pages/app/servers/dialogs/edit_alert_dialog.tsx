import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/base/dialog';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import {
  AlertForm,
  type AlertFormValues,
  type AlertMetric,
  type AlertOperator,
} from '@shulkr/frontend/pages/app/servers/features/alert_form';

type AlertRule = {
  id: number;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  actions: Array<string>;
};

export function EditAlertDialog({
  serverId,
  rule,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  serverId: string;
  rule: AlertRule;
  onOpenChange: (open: boolean) => void;
  onSubmit: (alertId: number, values: AlertFormValues) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AlertFormValues>({
    name: rule.name,
    metric: rule.metric,
    operator: rule.operator,
    threshold: rule.threshold,
    actions: [...rule.actions],
  });
  const handleSubmit = async () => {
    await onSubmit(rule.id, values);
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('alerts.editTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AlertForm {...{ serverId, values }} onChange={setValues} />
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!values.name || values.actions.length === 0 || isLoading} loading={isLoading}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
