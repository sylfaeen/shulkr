import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, RotateCcw, Terminal } from 'lucide-react';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export type TaskExecution = {
  id: number;
  taskId: number;
  status: 'pending' | 'running' | 'success' | 'failure';
  output: string | null;
  executedAt: string;
  startedAt: string | null;
  duration: number;
  retryCount: number;
  maxRetries: number;
};

export type TaskType = 'restart' | 'backup' | 'command';

export type ScheduledTask = {
  id: number;
  serverId: string;
  name: string;
  type: TaskType;
  command: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
};

export function useTasks(serverId: string | null) {
  return useQuery({
    queryKey: ['tasks', 'list', serverId],
    queryFn: async () => {
      const result = await apiClient.tasks.list({ params: { serverId: String(serverId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId,
  });
}

export function useTaskHistory(serverId: string, taskId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', 'history', serverId, taskId],
    queryFn: async () => {
      const result = await apiClient.tasks.history({ params: { serverId: String(serverId), taskId: String(taskId!) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!taskId && enabled,
    refetchInterval: 1000,
  });
}

export type CreateTaskInput = {
  name: string;
  command: string;
  schedule: string;
};

export function useCreateTask(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const result = await apiClient.tasks.create({
        params: { serverId: String(serverId) },
        body: { serverId, name: input.name, command: input.command, schedule: input.schedule },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.taskCreated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.taskCreateError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: CreateTaskInput) => mutation.mutateAsync(input),
  };
}

export type UpdateTaskInput = {
  name?: string;
  command?: string;
  schedule?: string;
  enabled?: boolean;
};

export function useUpdateTask(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ taskId, input }: { taskId: number; input: UpdateTaskInput }) => {
      const result = await apiClient.tasks.update({
        params: { serverId: String(serverId), taskId: String(taskId) },
        body: {
          name: input.name,
          command: input.command || undefined,
          schedule: input.schedule,
          enabled: input.enabled,
        },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.taskUpdated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.taskUpdateError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: ({ taskId, input }: { taskId: number; input: UpdateTaskInput }) => mutation.mutateAsync({ taskId, input }),
  };
}

export function useDeleteTask(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ taskId }: { taskId: number }) => {
      const result = await apiClient.tasks.delete({ params: { serverId: String(serverId), taskId: String(taskId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.taskDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.taskDeleteError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (taskId: number) => mutation.mutateAsync({ taskId }),
  };
}

export function useToggleTask(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ taskId }: { taskId: number }) => {
      const result = await apiClient.tasks.toggle({ params: { serverId: String(serverId), taskId: String(taskId) } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list', serverId] }).then();
      addToast({ type: 'success', title: t('toast.taskToggled') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.taskToggleError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (taskId: number) => mutation.mutateAsync({ taskId }),
  };
}

export function formatCronExpression(cron: string): string {
  const parts = cron.trim().split(/\s+/);

  let second: string;
  let minute: string;
  let hour: string;
  let day: string;
  let month: string;
  let weekday: string;

  if (parts.length === 6) {
    [second, minute, hour, day, month, weekday] = parts;
  } else if (parts.length === 5) {
    second = '0';
    [minute, hour, day, month, weekday] = parts;
  } else {
    return cron;
  }

  const isStandardDate = day === '*' && month === '*' && weekday === '*';

  if (parts.length === 6 && isStandardDate) {
    if (second === '*' && minute === '*' && hour === '*') {
      return 'Every second';
    }
    if (second.startsWith('*/') && minute === '*' && hour === '*') {
      return `Every ${second.slice(2)} seconds`;
    }
    if (second === '0' && minute === '*' && hour === '*') {
      return 'Every minute';
    }
    if (second === '0' && minute.startsWith('*/') && hour === '*') {
      return `Every ${minute.slice(2)} minutes`;
    }
    if (second === '0' && minute === '0' && hour === '*') {
      return 'Every hour';
    }
    if (second === '0' && minute === '0' && hour.startsWith('*/')) {
      return `Every ${hour.slice(2)} hours`;
    }
  }

  if (parts.length === 6 && second === '0') {
    if (minute === '0' && hour === '0' && day === '*' && month === '*' && weekday === '*') {
      return 'Daily at midnight';
    }
    if (minute !== '*' && hour !== '*' && day === '*' && month === '*' && weekday === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    if (minute === '0' && hour === '0' && day === '*' && month === '*' && weekday === '0') {
      return 'Weekly (Sunday midnight)';
    }
  }

  if (minute === '*' && hour === '*' && isStandardDate) {
    return 'Every minute';
  }
  if (minute === '0' && hour === '*' && isStandardDate) {
    return 'Every hour';
  }
  if (minute === '0' && hour === '0' && isStandardDate) {
    return 'Daily at midnight';
  }
  if (minute.startsWith('*/') && hour === '*' && isStandardDate) {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (hour.startsWith('*/') && isStandardDate) {
    return `Every ${hour.slice(2)} hours`;
  }
  if (minute !== '*' && hour !== '*' && isStandardDate) {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

export const CRON_PRESETS = [
  { label: 'Every second', value: '* * * * * *' },
  { label: 'Every 30 seconds', value: '*/30 * * * * *' },
  { label: 'Every minute', value: '0 * * * * *' },
  { label: 'Every hour', value: '0 0 * * * *' },
  { label: 'Every 6 hours', value: '0 0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 0 * * *' },
  { label: 'Daily at 4 AM', value: '0 0 4 * * *' },
  { label: 'Weekly (Sunday midnight)', value: '0 0 0 * * 0' },
  { label: 'Custom', value: '' },
] as const;

export type TaskTypeOption = {
  value: TaskType;
  label: string;
  description: string;
  icon: typeof RotateCcw;
  activeClass: string;
};

export function getTaskTypes(t: ReturnType<typeof useTranslation>['t']): Array<TaskTypeOption> {
  return [
    {
      value: 'restart',
      label: t('tasks.types.restart'),
      description: t('tasks.types.restartDesc'),
      icon: RotateCcw,
      activeClass: 'border-amber-500/40 bg-amber-500/5',
    },
    {
      value: 'backup',
      label: t('tasks.types.backup'),
      description: t('tasks.types.backupDesc'),
      icon: Archive,
      activeClass: 'border-green-600/40 bg-green-600/5',
    },
    {
      value: 'command',
      label: t('tasks.types.command'),
      description: t('tasks.types.commandDesc'),
      icon: Terminal,
      activeClass: 'border-purple-500/40 bg-purple-500/5',
    },
  ];
}
