import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { useWebhooks } from '@shulkr/frontend/hooks/use_webhooks';

export type AlertMetric = 'cpu' | 'ram' | 'disk' | 'tps';
export type AlertOperator = '>' | '<' | '>=' | '<=';

export type AlertFormValues = {
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  actions: Array<string>;
};

const METRICS: Array<AlertMetric> = ['cpu', 'ram', 'disk', 'tps'];
const OPERATORS: Array<AlertOperator> = ['>', '<', '>=', '<='];

export function generateAlertName(
  t: ReturnType<typeof useTranslation>['t'],
  metric: AlertMetric,
  operator: AlertOperator,
  threshold: number
): string {
  return `${t(`alerts.metric.${metric}`)} ${operator} ${threshold}%`;
}

export function AlertForm({
  serverId,
  values,
  onChange,
}: {
  serverId: string;
  values: AlertFormValues;
  onChange: (values: AlertFormValues) => void;
}) {
  const { t } = useTranslation();
  const { data: webhooks } = useWebhooks(serverId);
  const [isNameManual, setIsNameManual] = useState(false);

  useEffect(() => {
    if (!isNameManual) {
      const generated = generateAlertName(t, values.metric, values.operator, values.threshold);
      if (generated !== values.name) {
        onChange({ ...values, name: generated });
      }
    }
  }, [values.metric, values.operator, values.threshold, isNameManual, t]);

  const toggleAction = useCallback(
    (action: string) => {
      const next = values.actions.includes(action) ? values.actions.filter((a) => a !== action) : [...values.actions, action];
      onChange({ ...values, actions: next });
    },
    [values, onChange]
  );

  return (
    <div className={'space-y-4'}>
      <div className={'grid grid-cols-3 gap-2'}>
        <div className={'space-y-2'}>
          <Label>{t('alerts.metric.label')}</Label>
          <Select value={values.metric} onValueChange={(v) => onChange({ ...values, metric: v as AlertMetric })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`alerts.metric.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={'space-y-2'}>
          <Label>{t('alerts.operator')}</Label>
          <Select value={values.operator} onValueChange={(v) => onChange({ ...values, operator: v as AlertOperator })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={'space-y-2'}>
          <Label>{t('alerts.threshold')}</Label>
          <Input
            type={'number'}
            min={0}
            max={100}
            value={values.threshold}
            onChange={(e) => onChange({ ...values, threshold: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className={'space-y-2'}>
        <Label>{t('alerts.name')}</Label>
        <Input
          value={values.name}
          onChange={(e) => {
            onChange({ ...values, name: e.target.value });
            setIsNameManual(true);
          }}
          placeholder={t('alerts.namePlaceholder')}
        />
      </div>
      <div className={'space-y-2'}>
        <Label>{t('alerts.actionsLabel')}</Label>
        <div className={'space-y-1.5'}>
          <Label className={'flex items-center gap-1.5 text-sm'}>
            <Checkbox checked={values.actions.includes('notify')} onCheckedChange={() => toggleAction('notify')} />
            {t('alerts.action.notify')}
          </Label>
          <Label className={'flex items-center gap-1.5 text-sm'}>
            <Checkbox checked={values.actions.includes('restart')} onCheckedChange={() => toggleAction('restart')} />
            {t('alerts.action.restart')}
          </Label>
          <Label className={'flex items-center gap-1.5 text-sm'}>
            <Checkbox checked={values.actions.includes('backup')} onCheckedChange={() => toggleAction('backup')} />
            {t('alerts.action.backup')}
          </Label>
          {webhooks?.map((wh) => (
            <Label key={wh.id} className={'flex items-center gap-1.5 text-sm'}>
              <Checkbox
                checked={values.actions.includes(`webhook:${wh.id}`)}
                onCheckedChange={() => toggleAction(`webhook:${wh.id}`)}
              />
              {t('alerts.action.webhook')} ({wh.name})
            </Label>
          ))}
        </div>
      </div>
    </div>
  );
}
