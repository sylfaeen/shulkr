import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type TreeNode } from '@shulkr/frontend/features/ui/file_tree_selector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Form } from '@shulkr/frontend/features/ui/shadcn/form';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { FileTreeSelector } from '@shulkr/frontend/features/ui/file_tree_selector';
import { CRON_PRESETS, type ScheduledTask, type TaskType, type UpdateTaskInput } from '@shulkr/frontend/hooks/use_tasks';
import {
  TaskFormFields,
  taskFormSchema,
  type TaskFormValues,
} from '@shulkr/frontend/pages/app/servers/dialogs/create_task_dialog';

export function EditTaskDialog({
  serverId,
  serverTime,
  task,
  onSubmit,
  onCancel,
  isLoading,
}: {
  serverId: string;
  serverTime: string | undefined;
  task: ScheduledTask;
  onSubmit: (input: UpdateTaskInput) => Promise<void>;
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
          <DialogTitle>{t('tasks.editTask')}</DialogTitle>
          <DialogDescription>{t('tasks.subtitle')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <EditTaskForm {...{ serverId, serverTime, task, onSubmit, isLoading }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel} variant={'ghost'} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'edit-task-form'} loading={isLoading} disabled={isLoading}>
            {isLoading ? t('tasks.saving') : t('tasks.saveTask')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTaskForm({
  serverId,
  serverTime,
  task,
  onSubmit,
}: {
  serverId: string;
  serverTime: string | undefined;
  task: ScheduledTask;
  onSubmit: (input: UpdateTaskInput) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const initialCronPreset = CRON_PRESETS.some((p) => p.value === task.schedule) ? task.schedule : '';
  const [backupPaths, setBackupPaths] = useState<Set<string>>(() => new Set());
  const treeRef = useRef<Array<TreeNode>>([]);
  const savedBackupPaths = useMemo(() => {
    if (!task.command.startsWith('backup ')) return undefined;
    return task.command.replace('backup ', '').split(' ').filter(Boolean);
  }, [task.command]);
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: task.name,
      taskType: task.type,
      cronPreset: initialCronPreset,
      customCron: initialCronPreset === '' ? task.schedule : '',
      command: task.command,
      warnPlayers: task.warnPlayers ?? false,
      warnMessage: task.warnMessage ?? t('tasks.defaultWarnMessage'),
      warnSeconds: task.warnSeconds ?? 30,
      steps: task.steps ?? [],
      conditions: task.conditions,
    },
  });
  const handleTypeChange = (type: TaskType) => {
    form.setValue('taskType', type);
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
      conditions: data.conditions,
    }).then();
  };
  return (
    <Form {...form}>
      <form id={'edit-task-form'} className={'space-y-6'} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <TaskFormFields
          onTaskTypeChange={handleTypeChange}
          onBackupPathsChange={setBackupPaths}
          {...{
            form,
            serverId,
            serverTime,
            backupPaths,
            treeRef,
            initialBackupPaths: savedBackupPaths,
          }}
        />
      </form>
    </Form>
  );
}
