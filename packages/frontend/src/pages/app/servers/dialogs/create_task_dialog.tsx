import { type MutableRefObject, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@shulkr/frontend/lib/cn';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Checkbox } from '@shulkr/frontend/features/ui/base/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@shulkr/frontend/features/ui/base/form';
import { FileTreeSelector, type TreeNode } from '@shulkr/frontend/features/ui/file_tree_selector';
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
import { ServerTimeHint } from '@shulkr/frontend/pages/app/servers/features/server_time_hint';
import { CRON_PRESETS, getTaskTypes, type CreateTaskInput, type TaskType } from '@shulkr/frontend/hooks/use_tasks';
import { ChainEditor } from '@shulkr/frontend/features/tasks/chain_editor';
import { ConditionEditor } from '@shulkr/frontend/features/tasks/condition_editor';

const chainStepSchema = z.object({
  type: z.enum(['backup', 'restart', 'command', 'delay', 'webhook']),
  config: z.record(z.unknown()),
  onError: z.enum(['stop', 'continue']),
});

const conditionsSchema = z
  .object({
    logic: z.enum(['and', 'or']),
    rules: z.array(
      z.object({
        type: z.enum(['server_status', 'player_count', 'time_range']),
        config: z.record(z.unknown()),
      })
    ),
  })
  .nullable();

export const taskFormSchema = z.object({
  name: z.string().min(1),
  taskType: z.enum(['restart', 'backup', 'command', 'chain']),
  cronPreset: z.string(),
  customCron: z.string().optional(),
  command: z.string().optional(),
  warnPlayers: z.boolean().default(true),
  warnMessage: z.string().default(''),
  warnSeconds: z.coerce.number().min(5).max(300).default(30),
  steps: z.array(chainStepSchema).default([]),
  conditions: conditionsSchema.default(null),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export function CreateTaskDialog({
  serverId,
  serverTime,
  onSubmit,
  onCancel,
  isLoading,
}: {
  serverId: string;
  serverTime: string | undefined;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('tasks.newTask')}</DialogTitle>
          <DialogDescription>{t('tasks.subtitle')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CreateTaskForm {...{ serverId, serverTime, onSubmit, isLoading }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel} variant={'ghost'} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'create-task-form'} loading={isLoading} disabled={isLoading}>
            {isLoading ? t('tasks.creating') : t('tasks.createTask')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskForm({
  serverId,
  serverTime,
  onSubmit,
}: {
  serverId: string;
  serverTime: string | undefined;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const defaultNames: Partial<Record<TaskType, string>> = {
    restart: t('tasks.defaultName.restart'),
    backup: t('tasks.defaultName.backup'),
    command: t('tasks.defaultName.command'),
  };
  const [backupPaths, setBackupPaths] = useState<Set<string>>(() => new Set());
  const treeRef = useRef<Array<TreeNode>>([]);
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: defaultNames.restart ?? '',
      taskType: 'restart',
      cronPreset: '0 0 4 * * *',
      customCron: '',
      command: '',
      warnPlayers: true,
      warnMessage: t('tasks.defaultWarnMessage'),
      warnSeconds: 30,
      steps: [],
      conditions: null,
    },
  });
  const handleTypeChange = (type: TaskType) => {
    form.setValue('taskType', type);
    const currentName = form.getValues('name');
    const newName = defaultNames[type];
    if (newName && (!currentName || Object.values(defaultNames).includes(currentName))) {
      form.setValue('name', newName);
    }
  };
  const handleFormSubmit = (data: TaskFormValues) => {
    const cronExpression = data.cronPreset === '' ? (data.customCron ?? '') : data.cronPreset;
    if (!cronExpression) {
      alert(t('tasks.cronRequired'));
      return;
    }
    if (data.taskType === 'chain' && data.steps.length === 0) {
      alert(t('tasks.chainEditor.emptyAlert'));
      return;
    }
    let command = '';
    if (data.taskType === 'command') {
      command = data.command ?? '';
    } else if (data.taskType === 'backup') {
      command = `backup ${FileTreeSelector.optimizeSelectedPaths(treeRef.current, backupPaths).join(' ')}`;
    } else if (data.taskType === 'restart') {
      command = 'restart';
    } else if (data.taskType === 'chain') {
      command = 'chain';
    }
    return onSubmit({
      name: data.name,
      command,
      schedule: cronExpression,
      ...(data.taskType === 'restart' && {
        warnPlayers: data.warnPlayers,
        warnMessage: data.warnMessage,
        warnSeconds: data.warnSeconds,
      }),
      ...(data.taskType === 'chain' && { steps: data.steps }),
      ...(data.conditions !== null && { conditions: data.conditions }),
    }).then();
  };
  return (
    <Form {...form}>
      <form id={'create-task-form'} className={'space-y-6'} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <TaskFormFields
          onTaskTypeChange={handleTypeChange}
          onBackupPathsChange={setBackupPaths}
          {...{ form, serverId, serverTime, backupPaths, treeRef }}
        />
      </form>
    </Form>
  );
}

export function TaskFormFields({
  form,
  onTaskTypeChange,
  serverId,
  serverTime,
  backupPaths,
  onBackupPathsChange,
  treeRef,
  initialBackupPaths,
}: {
  form: UseFormReturn<TaskFormValues>;
  onTaskTypeChange: (type: TaskType) => void;
  serverId: string;
  serverTime: string | undefined;
  backupPaths: Set<string>;
  onBackupPathsChange: (paths: Set<string>) => void;
  treeRef: MutableRefObject<Array<TreeNode>>;
  initialBackupPaths?: Array<string>;
}) {
  const { t } = useTranslation();
  const taskType = form.watch('taskType');
  const cronPreset = form.watch('cronPreset');
  const customCron = form.watch('customCron');
  const warnPlayers = form.watch('warnPlayers');
  const chainSteps = form.watch('steps');
  const conditions = form.watch('conditions');
  const activeCron = cronPreset === '' ? (customCron ?? '') : cronPreset;
  const taskTypes = getTaskTypes(t);
  return (
    <>
      <FormField
        control={form.control}
        name={'name'}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('tasks.taskName')}</FormLabel>
            <FormControl>
              <Input type={'text'} placeholder={t('tasks.taskNamePlaceholder')} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormItem>
        <FormLabel>{t('tasks.taskType')}</FormLabel>
        <FormControl>
          <div className={'grid grid-cols-3 gap-2'}>
            {taskTypes.map((type) => {
              const Icon = type.icon;
              const isActive = taskType === type.value;
              return (
                <button
                  key={type.value}
                  type={'button'}
                  onClick={() => onTaskTypeChange(type.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    isActive
                      ? type.activeClass
                      : 'border-black/6 bg-zinc-50/50 text-zinc-600 hover:border-black/12 hover:bg-zinc-50 dark:border-white/6 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:border-white/12 dark:hover:bg-zinc-800'
                  )}
                >
                  <Icon
                    className={cn(
                      'mb-2 size-4 transition-colors',
                      isActive ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-600 dark:text-zinc-400'
                    )}
                    strokeWidth={2}
                  />
                  <div
                    className={cn(
                      'text-sm font-medium',
                      isActive ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'
                    )}
                  >
                    {type.label}
                  </div>
                  <div className={'mt-0.5 text-xs text-zinc-600 dark:text-zinc-400'}>{type.description}</div>
                </button>
              );
            })}
          </div>
        </FormControl>
      </FormItem>
      <FormField
        control={form.control}
        name={'cronPreset'}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('tasks.schedule')}</FormLabel>
            <Select value={field.value || '__custom__'} onValueChange={(val) => field.onChange(val === '__custom__' ? '' : val)}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CRON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value || '__custom__'} value={preset.value || '__custom__'}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
            <ServerTimeHint cronExpression={activeCron} {...{ serverTime }} />
          </FormItem>
        )}
      />
      {cronPreset === '' && (
        <FormField
          control={form.control}
          name={'customCron'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('tasks.customCron')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={'* * * * *'} className={'font-jetbrains'} {...field} />
              </FormControl>
              <p className={'mt-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>{t('tasks.cronFormat')}</p>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {taskType === 'command' && (
        <FormField
          control={form.control}
          name={'command'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('tasks.commandToExecute')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={t('tasks.commandPlaceholder')} className={'font-jetbrains'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {taskType === 'backup' && (
        <div>
          <FormLabel className={'mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
            {t('backups.dialogDescription')}
          </FormLabel>
          <FileTreeSelector
            enabled={true}
            selectedPaths={backupPaths}
            onSelectedPathsChange={onBackupPathsChange}
            initialPaths={initialBackupPaths}
            {...{ serverId, treeRef }}
          />
        </div>
      )}
      {taskType === 'restart' && (
        <div className={'space-y-3'}>
          <FormField
            control={form.control}
            name={'warnPlayers'}
            render={({ field }) => (
              <FormItem>
                <FormLabel className={'flex cursor-pointer items-center gap-2'}>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <span className={'text-zinc-600 dark:text-zinc-400'}>{t('tasks.warnPlayers')}</span>
                </FormLabel>
              </FormItem>
            )}
          />
          {warnPlayers && (
            <>
              <FormField
                control={form.control}
                name={'warnMessage'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={'mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400'}>
                      {t('tasks.warnMessage')}
                    </FormLabel>
                    <FormControl>
                      <Input type={'text'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'warnSeconds'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tasks.warnDelay')}</FormLabel>
                    <FormControl>
                      <Input type={'number'} min={5} max={300} className={'w-24'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>
      )}
      {taskType === 'chain' && (
        <ChainEditor
          steps={chainSteps}
          onChange={(next) => form.setValue('steps', next, { shouldDirty: true })}
          {...{ serverId }}
        />
      )}
      <ConditionEditor value={conditions} onChange={(next) => form.setValue('conditions', next, { shouldDirty: true })} />
    </>
  );
}
