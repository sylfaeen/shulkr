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
import { ServerTimeHint } from '@shulkr/frontend/pages/app/servers/features/server_time_hint';
import { CRON_PRESETS, type CreateTaskInput, type ScheduledTask, type TaskType } from '@shulkr/frontend/hooks/use_tasks';
import { TaskFormFields, taskFormSchema, type TaskFormValues } from '@shulkr/frontend/pages/app/servers/dialogs/create_task_dialog';

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
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  const initialCronPreset = CRON_PRESETS.some((p) => p.value === task.schedule) ? task.schedule : '';

  const inferredType: TaskType =
    task.command === 'restart' ? 'restart' : task.command.startsWith('backup') ? 'backup' : 'command';

  const [taskType, setTaskType] = useState<TaskType>(inferredType);
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
      cronPreset: initialCronPreset,
      customCron: initialCronPreset === '' ? task.schedule : '',
      command: task.command,
      warnPlayers: task.warnPlayers ?? true,
      warnMessage: task.warnMessage ?? t('tasks.defaultWarnMessage'),
      warnSeconds: task.warnSeconds ?? 30,
    },
  });

  const handleFormSubmit = (data: TaskFormValues) => {
    const cronExpression = data.cronPreset === '' ? (data.customCron ?? '') : data.cronPreset;
    if (!cronExpression) {
      alert(t('tasks.cronRequired'));
      return;
    }

    let command = '';
    if (taskType === 'command') {
      command = data.command ?? '';
    } else if (taskType === 'backup') {
      command = `backup ${FileTreeSelector.optimizeSelectedPaths(treeRef.current, backupPaths).join(' ')}`;
    } else if (taskType === 'restart') {
      command = 'restart';
    }

    return onSubmit({
      name: data.name,
      command,
      schedule: cronExpression,
      ...(taskType === 'restart' && {
        warnPlayers: data.warnPlayers,
        warnMessage: data.warnMessage,
        warnSeconds: data.warnSeconds,
      }),
    }).then();
  };

  return (
    <Form {...form}>
      <form id={'edit-task-form'} className={'space-y-6'} onSubmit={form.handleSubmit(handleFormSubmit)}>
        <TaskFormFields
          onTaskTypeChange={setTaskType}
          onBackupPathsChange={setBackupPaths}
          {...{ form, taskType, serverId, serverTime, backupPaths, treeRef, initialBackupPaths: savedBackupPaths }}
        />
      </form>
    </Form>
  );
}
