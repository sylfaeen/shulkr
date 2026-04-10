import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  File,
  Folder,
  Globe,
  Loader2,
  LoaderCircle,
  Pencil,
  Plus,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { cn } from '@shulkr/frontend/lib/cn';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useToggleTask,
  useTaskHistory,
  formatCronExpression,
  type ScheduledTask,
  type TaskExecution,
  type CreateTaskInput,
} from '@shulkr/frontend/hooks/use_tasks';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { CreateTaskDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_task_dialog';
import { EditTaskDialog } from '@shulkr/frontend/pages/app/servers/dialogs/edit_task_dialog';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerTasksPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('nav.tasks')}` : t('nav.tasks'));

  if (!server) return <PageError message={t('errors.generic')} />;
  if (serverLoading) return <ServerPageSkeleton />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Clock} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('tasks.title')}</ServerPageHeader.PageName>
              <ServerPageHeader.Docs path={'/guide/tasks'} />
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('tasks.subtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <TasksSection serverId={server.id} />
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function TasksSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<number | null>(null);
  const [gateTaskId, setGateTaskId] = useState<number | null>(null);

  const { data: tasksData, isLoading: tasksLoading } = useTasks(serverId);
  const createTask = useCreateTask(serverId);
  const updateTask = useUpdateTask(serverId);
  const deleteTask = useDeleteTask(serverId);
  const toggleTask = useToggleTask(serverId);

  const tasks = tasksData?.tasks;
  const serverTime = tasksData?.serverTime;
  const enabledCount = tasks?.filter((task) => task.enabled).length ?? 0;

  const handleCreateTask = async (input: CreateTaskInput) => {
    await createTask.mutateAsync(input);
    setShowForm(false);
  };

  const handleUpdateTask = async (input: CreateTaskInput) => {
    if (!editingTask) return;
    await updateTask.mutateAsync({ taskId: editingTask.id, input });
    setEditingTask(null);
  };

  const handleDelete = async (taskId: number) => {
    try {
      await deleteTask.mutateAsync(taskId);
    } catch {}
  };

  const handleToggle = async (taskId: number) => {
    try {
      await toggleTask.mutateAsync(taskId);
    } catch {}
  };

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={tasks && tasks.length > 0 && `${enabledCount}/${tasks.length}`}>
              {t('tasks.title')}
            </FeatureCard.Title>
            <FeatureCard.Description>{t('tasks.subtitle')}</FeatureCard.Description>
          </FeatureCard.Content>
          <FeatureCard.Actions>
            <Button onClick={() => setShowForm(true)}>
              <Plus className={'size-4'} />
              {t('tasks.addTask')}
            </Button>
            {showForm && (
              <CreateTaskDialog
                onSubmit={handleCreateTask}
                onCancel={() => setShowForm(false)}
                isLoading={createTask.isPending}
                {...{ serverId, serverTime }}
              />
            )}
            {editingTask && (
              <EditTaskDialog
                task={editingTask}
                onSubmit={handleUpdateTask}
                onCancel={() => setEditingTask(null)}
                isLoading={updateTask.isPending}
                {...{ serverId, serverTime }}
              />
            )}
          </FeatureCard.Actions>
        </FeatureCard.Header>
        <FeatureCard.Body>
          {tasksLoading ? (
            <div className={'py-8 text-center'}>
              <LoaderCircle className={'mx-auto size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <FeatureCard.Empty icon={Clock} title={t('tasks.noTasks')} description={t('tasks.createFirst')} />
          ) : (
            <>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  onToggle={handleToggle}
                  onEdit={setEditingTask}
                  onRequestDelete={setGateTaskId}
                  onToggleConfirm={setToggleConfirm}
                  {...{ serverId, task, toggleConfirm }}
                />
              ))}
            </>
          )}
        </FeatureCard.Body>
        <FeatureCard.Footer alert>{serverTime && <ServerTimeBanner {...{ serverTime }} />}</FeatureCard.Footer>
      </FeatureCard>
      <PasswordGate
        open={gateTaskId !== null}
        onOpenChange={(open) => !open && setGateTaskId(null)}
        title={t('tasks.tooltipDelete')}
        description={t('tasks.deleteTaskDescription')}
        confirmLabel={t('tasks.tooltipDelete')}
        destructive
        onConfirm={async () => {
          if (gateTaskId !== null) await handleDelete(gateTaskId);
        }}
      />
    </>
  );
}

function TaskRow({
  serverId,
  task,
  toggleConfirm,
  onToggle,
  onEdit,
  onRequestDelete,
  onToggleConfirm,
}: {
  serverId: string;
  task: ScheduledTask;
  toggleConfirm: number | null;
  onToggle: (taskId: number) => void;
  onEdit: (task: ScheduledTask) => void;
  onRequestDelete: (taskId: number) => void;
  onToggleConfirm: (taskId: number | null) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <FeatureCard.Stack className={'gap-y-0'}>
      <FeatureCard.Row>
        <button type={'button'} className={'flex items-start gap-3 text-left'} onClick={() => setExpanded(!expanded)}>
          <div
            className={cn(
              'relative top-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity',
              task.enabled ? 'bg-green-600 text-white' : 'bg-zinc-300 dark:bg-zinc-100/10 dark:text-zinc-400'
            )}
          >
            <Terminal className={'size-4'} strokeWidth={2} />
          </div>
          <div className={cn('min-w-0', !task.enabled && 'opacity-50')}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{task.name}</span>
              <Badge variant={'outline'} className={'font-medium'}>
                {t(`tasks.types.${task.type}`)}
              </Badge>
              {!task.enabled && <Badge variant={'secondary'}>{t('tasks.disabled')}</Badge>}
              <ChevronDown
                className={cn('size-3.5 text-zinc-400 transition-transform dark:text-zinc-500', expanded && 'rotate-180')}
              />
            </div>
            <div className={'flex items-center gap-2 text-sm'}>
              <span className={'text-zinc-600 dark:text-zinc-400'}>{formatCronExpression(task.schedule)}</span>
              <span className={'font-jetbrains text-sm text-zinc-600 dark:text-zinc-400'}>({task.schedule})</span>
            </div>
            {task.lastRun && (
              <div className={'flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
                <Clock className={'size-3'} strokeWidth={2} />
                <span>
                  {t('tasks.lastRun')}: {new Date(task.lastRun).toLocaleString()}
                </span>
              </div>
            )}
            {task.command &&
              (task.type === 'backup' && task.command.startsWith('backup ') ? (
                <BackupPathsDisplay command={task.command} />
              ) : (
                <div
                  className={
                    'font-jetbrains mt-2 inline-block rounded-md border border-black/10 bg-zinc-100/80 px-2.5 py-1 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-800/80 dark:text-zinc-400'
                  }
                >
                  <span className={'mr-1.5 text-zinc-600 dark:text-zinc-400'}>$</span>
                  {task.command}
                </div>
              ))}
          </div>
        </button>
        <FeatureCard.RowControl>
          {toggleConfirm === task.id ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button
                onClick={() => {
                  onToggle(task.id);
                  onToggleConfirm(null);
                }}
                variant={task.enabled ? 'secondary' : 'success'}
                size={'xs'}
              >
                {t('common.yes')}
              </Button>
              <Button onClick={() => onToggleConfirm(null)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={'flex items-center'}>
                      <Switch checked={task.enabled} onCheckedChange={() => onToggleConfirm(task.id)} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                    {task.enabled ? t('tasks.tooltipDisable') : t('tasks.tooltipEnable')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => onEdit(task)}
                      variant={'ghost'}
                      size={'icon-sm'}
                      className={'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-400'}
                    >
                      <Pencil className={'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('tasks.tooltipEdit')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={() => onRequestDelete(task.id)} variant={'ghost-destructive'} size={'icon-sm'}>
                      <Trash2 className={'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('tasks.tooltipDelete')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      {expanded && <TaskHistory {...{ serverId }} taskId={task.id} />}
    </FeatureCard.Stack>
  );
}

function BackupPathsDisplay({ command }: { command: string }) {
  const BACKUP_PATHS_COLLAPSED_MAX = 6;
  const [expanded, setExpanded] = useState(false);

  const paths = command.replace('backup ', '').split(' ').filter(Boolean);
  const visiblePaths = expanded ? paths : paths.slice(0, BACKUP_PATHS_COLLAPSED_MAX);
  const hiddenCount = paths.length - BACKUP_PATHS_COLLAPSED_MAX;

  return (
    <div className={'mt-2 flex flex-wrap items-center gap-1'}>
      {visiblePaths.map((p) => {
        const isDir = !p.includes('.') || p.endsWith('/');
        const Icon = isDir ? Folder : File;
        return (
          <span
            key={p}
            className={
              'font-jetbrains inline-flex items-center gap-1 rounded-md border border-black/6 bg-zinc-100/80 px-1.5 py-0.5 text-[12px] text-zinc-600 dark:border-white/8 dark:bg-zinc-800/80 dark:text-zinc-400'
            }
          >
            <Icon className={'size-3 shrink-0 text-zinc-400 dark:text-zinc-500'} strokeWidth={2} />
            {p}
          </span>
        );
      })}
      {hiddenCount > 0 && (
        <button
          type={'button'}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className={
            'font-jetbrains inline-flex items-center rounded-md border border-black/6 bg-zinc-200/60 px-1.5 py-0.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:border-white/8 dark:bg-zinc-700/60 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-300'
          }
        >
          {expanded ? '−' : `+${hiddenCount}`}
        </button>
      )}
    </div>
  );
}

function TaskHistory({ serverId, taskId }: { serverId: string; taskId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTaskHistory(serverId, taskId, true);

  return (
    <div className={'border-t border-black/6 px-5 pt-3 pb-4 dark:border-white/6'}>
      <div className={'text-sm font-medium text-zinc-600 dark:text-zinc-400'}>{t('tasks.history')}</div>
      {isLoading ? (
        <div className={'flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500'}>
          <Loader2 className={'size-3.5 animate-spin'} />
          {t('common.loading')}
        </div>
      ) : !data || data.executions.length === 0 ? (
        <div className={'text-sm text-zinc-400 dark:text-zinc-500'}>{t('tasks.noHistory')}</div>
      ) : (
        <div className={'max-h-64 overflow-y-auto'}>
          {data.executions.map((exec: TaskExecution) => (
            <div
              key={exec.id}
              className={
                'flex h-5 items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60'
              }
            >
              <div className={'flex items-center justify-start gap-2'}>
                <ExecutionStatusIcon status={exec.status} />
                <span className={'font-jetbrains text-[11px] text-zinc-600 tabular-nums dark:text-zinc-400'}>
                  {new Date(exec.executedAt).toLocaleString()}
                </span>
                {exec.retryCount > 0 && (
                  <span className={'text-[10px] text-amber-500'}>
                    {t('tasks.retry', { current: exec.retryCount, max: exec.maxRetries })}
                  </span>
                )}
              </div>
              <div className={'space-x-2'}>
                {exec.output && exec.status === 'failure' && (
                  <span className={'truncate text-[11px] text-red-400'}>{exec.output}</span>
                )}
                {(exec.status === 'success' || exec.status === 'failure') && (
                  <span className={'font-jetbrains text-[11px] text-zinc-600 tabular-nums dark:text-zinc-400'}>
                    {t('tasks.duration', { ms: exec.duration })}
                  </span>
                )}
                {exec.status === 'pending' && (
                  <span className={'text-[11px] text-zinc-400 dark:text-zinc-500'}>{t('tasks.pending')}</span>
                )}
                {exec.status === 'running' && <span className={'text-[11px] text-blue-500'}>{t('tasks.running')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServerTimeBanner({ serverTime }: { serverTime: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const serverDate = new Date(serverTime);
  const offsetMs = now.getTime() - serverDate.getTime();
  const liveServerTime = new Date(now.getTime() - offsetMs);

  const serverFormatted = liveServerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const localFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const diffHours = Math.round((now.getTime() - liveServerTime.getTime()) / 3_600_000);
  const hasDiff = serverFormatted !== localFormatted;

  if (!hasDiff) {
    return (
      <Alert variant={'info'}>
        <Globe className={'size-4'} />
        <AlertDescription>
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-xs'}>{t('tasks.serverLabel')}</span>
            <span className={'font-jetbrains text-xs font-medium tabular-nums'}>{serverFormatted}</span>
          </div>
          <p className={'text-[11px] opacity-70'}>{t('tasks.timezoneBannerSame')}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant={'warning'}>
      <Globe className={'size-4'} />
      <AlertDescription>
        <div className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-xs'}>{t('tasks.serverLabel')}</span>
            <span className={'font-jetbrains text-xs font-semibold tabular-nums'}>{serverFormatted}</span>
          </div>
          <ArrowRight className={'size-3 opacity-40'} strokeWidth={2} />
          <div className={'flex items-center gap-1.5'}>
            <span className={'text-xs'}>{t('tasks.localLabel')}</span>
            <span className={'font-jetbrains text-xs font-semibold tabular-nums'}>{localFormatted}</span>
            <span className={'font-jetbrains text-[11px] tabular-nums opacity-60'}>
              ({diffHours >= 0 ? '+' : ''}
              {diffHours}h)
            </span>
          </div>
        </div>
        <p className={'text-[11px] opacity-70'}>{t('tasks.timezoneBannerWarning')}</p>
      </AlertDescription>
    </Alert>
  );
}

function ExecutionStatusIcon({ status }: { status: TaskExecution['status'] }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className={'size-3 shrink-0 text-green-600'} />;
    case 'failure':
      return <XCircle className={'size-3.5 shrink-0 text-red-500'} />;
    case 'running':
      return <Loader2 className={'size-3 shrink-0 animate-spin text-blue-500'} />;
    case 'pending':
      return <Clock className={'size-3 shrink-0 text-zinc-400 dark:text-zinc-500'} />;
  }
}
