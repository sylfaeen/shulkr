import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { type ChainStep, type ChainStepType } from '@shulkr/frontend/hooks/use_tasks';
import {
  ChainStepConfig,
  createEmptyStep,
  getChainStepTypes,
  summarizeStep,
} from '@shulkr/frontend/features/tasks/chain_step_config';

export function ChainEditor({
  steps,
  onChange,
  serverId,
}: {
  steps: Array<ChainStep>;
  onChange: (next: Array<ChainStep>) => void;
  serverId: string;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [idMap] = useState(() => new WeakMap<ChainStep, string>());
  const [idCounter, setIdCounter] = useState(0);
  const getId = (step: ChainStep): string => {
    const existing = idMap.get(step);
    if (existing) return existing;
    const next = `step-${idCounter + 1}`;
    idMap.set(step, next);
    return next;
  };
  const indexedSteps: Array<ChainStep & { _id: string }> = steps.map((step) => ({ ...step, _id: getId(step) }));
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const stepTypes = getChainStepTypes(t);
  const updateStep = (index: number, next: ChainStep) => {
    idMap.set(next, indexedSteps[index]._id);
    onChange(steps.map((s, i) => (i === index ? next : s)));
  };
  const removeStep = (index: number) => {
    const removedId = indexedSteps[index]._id;
    onChange(steps.filter((_, i) => i !== index));
    if (expandedId === removedId) setExpandedId(null);
  };
  const moveStepBy = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    onChange(arrayMove(steps, index, target));
  };
  const addStep = (type: ChainStepType) => {
    const newStep = createEmptyStep(type);
    const nextCounter = idCounter + 1;
    const newId = `step-${nextCounter}`;
    idMap.set(newStep, newId);
    setIdCounter(nextCounter);
    onChange([...steps, newStep]);
    setExpandedId(newId);
    setShowAddMenu(false);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = indexedSteps.findIndex((s) => s._id === active.id);
    const toIndex = indexedSteps.findIndex((s) => s._id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    onChange(arrayMove(steps, fromIndex, toIndex));
  };
  return (
    <div className={'space-y-3'}>
      <div>
        <div className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('tasks.chainEditor.title')}</div>
        <p className={'text-xs text-zinc-500 dark:text-zinc-500'}>{t('tasks.chainEditor.description')}</p>
      </div>
      {steps.length === 0 ? (
        <div
          className={
            'rounded-lg border border-dashed border-black/15 bg-zinc-50/50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-zinc-900/30 dark:text-zinc-500'
          }
        >
          {t('tasks.chainEditor.empty')}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={indexedSteps.map((s) => s._id)} strategy={verticalListSortingStrategy}>
            <ol className={'space-y-2'}>
              {indexedSteps.map((step, index) => {
                const meta = stepTypes.find((x) => x.value === step.type);
                return (
                  <SortableStepItem
                    key={step._id}
                    id={step._id}
                    index={index}
                    step={step}
                    meta={meta}
                    isExpanded={expandedId === step._id}
                    isFirst={index === 0}
                    isLast={index === steps.length - 1}
                    onToggle={() => setExpandedId(expandedId === step._id ? null : step._id)}
                    onMoveUp={() => moveStepBy(index, -1)}
                    onMoveDown={() => moveStepBy(index, 1)}
                    onRemove={() => removeStep(index)}
                    onStepChange={(next) => updateStep(index, next)}
                    {...{ serverId }}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className={'relative'}>
        <Button type={'button'} variant={'outline'} onClick={() => setShowAddMenu((v) => !v)} icon={Plus}>
          {t('tasks.chainEditor.addStep')}
        </Button>
        {showAddMenu && (
          <div
            className={
              'absolute z-10 mt-1.5 w-64 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900'
            }
          >
            {stepTypes.map((meta) => {
              const Icon = meta.icon;
              return (
                <button
                  key={meta.value}
                  type={'button'}
                  onClick={() => addStep(meta.value)}
                  className={
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }
                >
                  <Icon className={cn('size-4 shrink-0', meta.accentClass)} strokeWidth={2} />
                  <div>
                    <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{meta.label}</div>
                    <div className={'text-xs text-zinc-500 dark:text-zinc-500'}>{meta.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableStepItem({
  id,
  index,
  step,
  meta,
  isExpanded,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onRemove,
  onStepChange,
  serverId,
}: {
  id: string;
  index: number;
  step: ChainStep;
  meta: ReturnType<typeof getChainStepTypes>[number] | undefined;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onStepChange: (next: ChainStep) => void;
  serverId: string;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const Icon = meta?.icon;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-white transition dark:bg-zinc-900/50',
        isDragging ? 'border-blue-500/60 shadow-lg ring-1 ring-blue-500/30' : 'border-black/8 dark:border-white/8'
      )}
    >
      <div className={'flex items-center gap-2 px-2.5 py-2'}>
        <button
          type={'button'}
          aria-label={t('tasks.chainEditor.dragHandle')}
          className={
            'cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing dark:text-zinc-500 dark:hover:text-zinc-300'
          }
          {...attributes}
          {...listeners}
        >
          <GripVertical className={'size-4'} strokeWidth={2} />
        </button>
        <span
          className={
            'font-jetbrains flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400'
          }
        >
          {index + 1}
        </span>
        <button type={'button'} onClick={onToggle} className={'flex min-w-0 flex-1 items-center gap-2 text-left'}>
          {Icon && <Icon className={cn('size-4 shrink-0', meta?.accentClass)} strokeWidth={2} />}
          <div className={'min-w-0 flex-1'}>
            <div className={'flex items-center gap-2'}>
              <span className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{meta?.label}</span>
              {step.onError === 'continue' && (
                <span
                  className={
                    'rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400'
                  }
                >
                  {t('tasks.stepConfig.onError_continue')}
                </span>
              )}
            </div>
            <div className={'truncate text-xs text-zinc-500 dark:text-zinc-500'}>{summarizeStep(step, t)}</div>
          </div>
          <ChevronDown
            className={cn('size-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500', isExpanded && 'rotate-180')}
          />
        </button>
        <div className={'flex shrink-0 items-center gap-0.5'}>
          <Button
            type={'button'}
            variant={'ghost'}
            size={'icon-sm'}
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label={t('tasks.chainEditor.moveUp')}
            icon={ChevronUp}
          />
          <Button
            type={'button'}
            variant={'ghost'}
            size={'icon-sm'}
            disabled={isLast}
            onClick={onMoveDown}
            aria-label={t('tasks.chainEditor.moveDown')}
            icon={ChevronDown}
          />
          <Button
            type={'button'}
            variant={'ghost-destructive'}
            size={'icon-sm'}
            onClick={onRemove}
            aria-label={t('tasks.chainEditor.remove')}
            icon={Trash2}
          />
        </div>
      </div>
      {isExpanded && (
        <div className={'border-t border-black/6 px-3 py-3 dark:border-white/6'}>
          <ChainStepConfig step={step} onChange={onStepChange} {...{ serverId }} />
        </div>
      )}
    </li>
  );
}
