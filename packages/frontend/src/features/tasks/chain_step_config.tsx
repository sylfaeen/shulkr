import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, RotateCcw, Terminal, Timer, Webhook } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { FileTreeSelector, type TreeNode } from '@shulkr/frontend/features/ui/file_tree_selector';
import { type ChainStep, type ChainStepType } from '@shulkr/frontend/hooks/use_tasks';

type StepTypeMeta = {
  value: ChainStepType;
  label: string;
  description: string;
  icon: typeof Archive;
  accentClass: string;
};

export function getChainStepTypes(t: ReturnType<typeof useTranslation>['t']): Array<StepTypeMeta> {
  return [
    {
      value: 'backup',
      label: t('tasks.stepTypes.backup'),
      description: t('tasks.stepTypes.backupDesc'),
      icon: Archive,
      accentClass: 'text-green-600 dark:text-green-400',
    },
    {
      value: 'restart',
      label: t('tasks.stepTypes.restart'),
      description: t('tasks.stepTypes.restartDesc'),
      icon: RotateCcw,
      accentClass: 'text-amber-500 dark:text-amber-400',
    },
    {
      value: 'command',
      label: t('tasks.stepTypes.command'),
      description: t('tasks.stepTypes.commandDesc'),
      icon: Terminal,
      accentClass: 'text-purple-500 dark:text-purple-400',
    },
    {
      value: 'delay',
      label: t('tasks.stepTypes.delay'),
      description: t('tasks.stepTypes.delayDesc'),
      icon: Timer,
      accentClass: 'text-sky-500 dark:text-sky-400',
    },
    {
      value: 'webhook',
      label: t('tasks.stepTypes.webhook'),
      description: t('tasks.stepTypes.webhookDesc'),
      icon: Webhook,
      accentClass: 'text-rose-500 dark:text-rose-400',
    },
  ];
}

export function createEmptyStep(type: ChainStepType): ChainStep {
  if (type === 'backup') return { type, config: { paths: [] }, onError: 'stop' };
  if (type === 'restart') return { type, config: { warnPlayers: true, warnMessage: '', warnSeconds: 30 }, onError: 'stop' };
  if (type === 'command') return { type, config: { command: '' }, onError: 'stop' };
  if (type === 'delay') return { type, config: { seconds: 10 }, onError: 'stop' };
  return { type: 'webhook', config: { url: '' }, onError: 'stop' };
}

export function summarizeStep(step: ChainStep, t: ReturnType<typeof useTranslation>['t']): string {
  if (step.type === 'backup') {
    const paths = (step.config.paths as Array<string> | undefined) ?? [];
    if (paths.length === 0) return t('tasks.chainEditor.summaryBackupEmpty');
    return t('tasks.chainEditor.summaryBackupPaths', { count: paths.length });
  }
  if (step.type === 'restart') {
    const warn = step.config.warnPlayers as boolean | undefined;
    return warn ? t('tasks.chainEditor.summaryRestartWarn') : t('tasks.chainEditor.summaryRestart');
  }
  if (step.type === 'command') {
    const command = (step.config.command as string | undefined) ?? '';
    return command || t('tasks.chainEditor.summaryCommandEmpty');
  }
  if (step.type === 'delay') {
    const seconds = (step.config.seconds as number | undefined) ?? 0;
    return t('tasks.chainEditor.summaryDelay', { seconds });
  }
  const url = (step.config.url as string | undefined) ?? '';
  return url || t('tasks.chainEditor.summaryWebhookEmpty');
}

export function ChainStepConfig({
  step,
  onChange,
  serverId,
}: {
  step: ChainStep;
  onChange: (next: ChainStep) => void;
  serverId: string;
}) {
  const { t } = useTranslation();
  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ ...step, config: { ...step.config, ...patch } });
  };
  return (
    <div className={'space-y-3'}>
      {step.type === 'command' && (
        <LabeledField label={t('tasks.stepConfig.command')}>
          <Input
            type={'text'}
            className={'font-jetbrains'}
            placeholder={t('tasks.commandPlaceholder')}
            value={(step.config.command as string | undefined) ?? ''}
            onChange={(event) => updateConfig({ command: event.target.value })}
          />
        </LabeledField>
      )}
      {step.type === 'delay' && (
        <LabeledField label={t('tasks.stepConfig.delaySeconds')}>
          <Input
            type={'number'}
            min={1}
            max={3600}
            className={'w-32'}
            value={(step.config.seconds as number | undefined) ?? 10}
            onChange={(event) => updateConfig({ seconds: Number(event.target.value) })}
          />
        </LabeledField>
      )}
      {step.type === 'webhook' && (
        <LabeledField label={t('tasks.stepConfig.webhookUrl')}>
          <Input
            type={'url'}
            placeholder={'https://…'}
            value={(step.config.url as string | undefined) ?? ''}
            onChange={(event) => updateConfig({ url: event.target.value })}
          />
        </LabeledField>
      )}
      {step.type === 'restart' && (
        <>
          <Label className={'flex items-center gap-2 text-sm'}>
            <Checkbox
              checked={Boolean(step.config.warnPlayers)}
              onCheckedChange={(checked) => updateConfig({ warnPlayers: Boolean(checked) })}
            />
            {t('tasks.warnPlayers')}
          </Label>
          {Boolean(step.config.warnPlayers) && (
            <>
              <LabeledField label={t('tasks.warnMessage')}>
                <Input
                  type={'text'}
                  value={(step.config.warnMessage as string | undefined) ?? ''}
                  onChange={(event) => updateConfig({ warnMessage: event.target.value })}
                />
              </LabeledField>
              <LabeledField label={t('tasks.warnDelay')}>
                <Input
                  type={'number'}
                  min={5}
                  max={300}
                  className={'w-24'}
                  value={(step.config.warnSeconds as number | undefined) ?? 30}
                  onChange={(event) => updateConfig({ warnSeconds: Number(event.target.value) })}
                />
              </LabeledField>
            </>
          )}
        </>
      )}
      {step.type === 'backup' && (
        <LabeledField label={t('tasks.stepConfig.backupPaths')}>
          <BackupStepPaths step={step} onChange={onChange} serverId={serverId} />
          <p className={'mt-1 text-[11px] text-zinc-500 dark:text-zinc-500'}>{t('tasks.stepConfig.backupPathsHint')}</p>
        </LabeledField>
      )}
      <LabeledField label={t('tasks.stepConfig.onError')}>
        <div className={'flex gap-2'}>
          {(['stop', 'continue'] as const).map((mode) => {
            const isActive = step.onError === mode;
            return (
              <button
                key={mode}
                type={'button'}
                onClick={() => onChange({ ...step, onError: mode })}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition',
                  isActive
                    ? 'border-zinc-700 bg-zinc-800 text-zinc-100 dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'border-black/10 bg-zinc-50 text-zinc-600 hover:border-black/20 dark:border-white/10 dark:bg-zinc-800/50 dark:text-zinc-400'
                )}
              >
                {t(`tasks.stepConfig.onError_${mode}`)}
              </button>
            );
          })}
        </div>
      </LabeledField>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={'mb-1 block text-xs font-medium'}>{label}</Label>
      {children}
    </div>
  );
}

function BackupStepPaths({
  step,
  onChange,
  serverId,
}: {
  step: ChainStep;
  onChange: (next: ChainStep) => void;
  serverId: string;
}) {
  const savedPaths = useMemo(() => (step.config.paths as Array<string> | undefined) ?? [], []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const treeRef = useRef<Array<TreeNode>>([]);
  const stepRef = useRef(step);
  stepRef.current = step;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const handleSelectedChange = useCallback((next: Set<string>) => {
    setSelected(next);
    const optimized = FileTreeSelector.optimizeSelectedPaths(treeRef.current, next);
    onChangeRef.current({ ...stepRef.current, config: { paths: optimized } });
  }, []);
  return (
    <FileTreeSelector
      enabled={true}
      selectedPaths={selected}
      onSelectedPathsChange={handleSelectedChange}
      initialPaths={savedPaths.length > 0 ? savedPaths : undefined}
      {...{ serverId, treeRef }}
    />
  );
}
