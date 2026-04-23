import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { type ConditionRule, type ConditionRuleType, type TaskConditions } from '@shulkr/frontend/hooks/use_tasks';

export function ConditionEditor({
  value,
  onChange,
}: {
  value: TaskConditions | null;
  onChange: (next: TaskConditions | null) => void;
}) {
  const { t } = useTranslation();
  const enabled = value !== null;
  const logic = value?.logic ?? 'and';
  const rules = value?.rules ?? [];
  const toggleEnabled = (next: boolean) => {
    if (!next) onChange(null);
    else onChange({ logic: 'and', rules: [createEmptyRule('server_status')] });
  };
  const updateRules = (next: Array<ConditionRule>) => {
    onChange({ logic, rules: next });
  };
  const setLogic = (next: 'and' | 'or') => {
    onChange({ logic: next, rules });
  };
  const addRule = () => {
    updateRules([...rules, createEmptyRule('server_status')]);
  };
  const updateRule = (index: number, next: ConditionRule) => {
    updateRules(rules.map((r, i) => (i === index ? next : r)));
  };
  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    if (next.length === 0) onChange(null);
    else updateRules(next);
  };
  return (
    <div className={'space-y-3 rounded-lg border border-black/8 bg-zinc-50/50 p-3 dark:border-white/8 dark:bg-zinc-900/30'}>
      <div className={'flex items-start gap-3'}>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} aria-label={t('tasks.conditions.title')} className={'mt-0.5'} />
        <div>
          <div className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('tasks.conditions.title')}</div>
          <p className={'text-xs text-zinc-500 dark:text-zinc-500'}>{t('tasks.conditions.description')}</p>
        </div>
      </div>
      {enabled && (
        <>
          {rules.length > 1 && (
            <div className={'flex items-center gap-2'}>
              <span className={'text-xs text-zinc-600 dark:text-zinc-400'}>{t('tasks.conditions.logicLabel')}</span>
              <div className={'flex gap-1'}>
                {(['and', 'or'] as const).map((mode) => {
                  const isActive = logic === mode;
                  return (
                    <button
                      key={mode}
                      type={'button'}
                      onClick={() => setLogic(mode)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs transition',
                        isActive
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-100 dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900'
                          : 'border-black/10 bg-white text-zinc-600 hover:border-black/20 dark:border-white/10 dark:bg-zinc-800/50 dark:text-zinc-400'
                      )}
                    >
                      {t(`tasks.conditions.logic_${mode}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <ul className={'space-y-2'}>
            {rules.map((rule, index) => (
              <li
                key={index}
                className={'rounded-md border border-black/8 bg-white px-3 py-2 dark:border-white/8 dark:bg-zinc-800/30'}
              >
                <RuleRow rule={rule} onChange={(next) => updateRule(index, next)} onRemove={() => removeRule(index)} />
              </li>
            ))}
          </ul>
          <Button type={'button'} variant={'outline'} size={'sm'} onClick={addRule} icon={Plus} iconClass={'size-3.5'}>
            {t('tasks.conditions.addRule')}
          </Button>
        </>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: ConditionRule;
  onChange: (next: ConditionRule) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const PLAYER_OPERATORS = ['>', '<', '>=', '<=', '='] as const;
  const setType = (type: ConditionRuleType) => {
    onChange(createEmptyRule(type));
  };
  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ ...rule, config: { ...rule.config, ...patch } });
  };
  return (
    <div className={'flex flex-wrap items-center gap-2'}>
      <Select value={rule.type} onValueChange={(v) => setType(v as ConditionRuleType)}>
        <SelectTrigger className={'h-8 w-40 text-xs'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={'server_status'}>{t('tasks.conditions.types.server_status')}</SelectItem>
          <SelectItem value={'player_count'}>{t('tasks.conditions.types.player_count')}</SelectItem>
          <SelectItem value={'time_range'}>{t('tasks.conditions.types.time_range')}</SelectItem>
        </SelectContent>
      </Select>
      {rule.type === 'server_status' && (
        <Select value={(rule.config.status as string | undefined) ?? 'online'} onValueChange={(v) => updateConfig({ status: v })}>
          <SelectTrigger className={'h-8 w-32 text-xs'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={'online'}>{t('tasks.conditions.serverStatus.online')}</SelectItem>
            <SelectItem value={'offline'}>{t('tasks.conditions.serverStatus.offline')}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {rule.type === 'player_count' && (
        <>
          <Select
            value={(rule.config.operator as (typeof PLAYER_OPERATORS)[number] | undefined) ?? '>'}
            onValueChange={(v) => updateConfig({ operator: v })}
          >
            <SelectTrigger className={'h-8 w-20 text-xs'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYER_OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type={'number'}
            min={0}
            className={'h-8 w-24 text-xs'}
            value={(rule.config.value as number | undefined) ?? 0}
            onChange={(event) => updateConfig({ value: Number(event.target.value) })}
          />
          <span className={'text-xs text-zinc-500 dark:text-zinc-500'}>{t('tasks.conditions.playerCount.unit')}</span>
        </>
      )}
      {rule.type === 'time_range' && (
        <>
          <Input
            type={'time'}
            className={'h-8 w-28 text-xs'}
            value={(rule.config.from as string | undefined) ?? '00:00'}
            onChange={(event) => updateConfig({ from: event.target.value })}
          />
          <span className={'text-xs text-zinc-500 dark:text-zinc-500'}>{t('tasks.conditions.timeRange.to')}</span>
          <Input
            type={'time'}
            className={'h-8 w-28 text-xs'}
            value={(rule.config.to as string | undefined) ?? '23:59'}
            onChange={(event) => updateConfig({ to: event.target.value })}
          />
        </>
      )}
      <div className={'ml-auto'}>
        <Button
          type={'button'}
          variant={'ghost-destructive'}
          size={'icon-sm'}
          onClick={onRemove}
          aria-label={t('tasks.conditions.removeRule')}
          icon={Trash2}
        />
      </div>
    </div>
  );
}

function createEmptyRule(type: ConditionRuleType): ConditionRule {
  if (type === 'server_status') return { type, config: { status: 'online' } };
  if (type === 'player_count') return { type, config: { operator: '>', value: 0 } };
  return { type: 'time_range', config: { from: '00:00', to: '23:59' } };
}
