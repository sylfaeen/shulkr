import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { PERMISSION_TREE } from '@shulkr/shared';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { cn } from '@shulkr/frontend/lib/cn';

export function PermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Array<string>;
  onChange: (permissions: Array<string>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const isAdmin = value.includes('*');
  const locked = getLockedPermissions(value);

  const applyChange = (perms: Array<string>) => onChange(enforceDependencies(perms));

  const toggleAdmin = () => {
    onChange(isAdmin ? [] : ['*']);
  };

  const toggleGroup = (groupKey: string, actions: ReadonlyArray<string>) => {
    if (isAdmin) return;
    const hasGroup = value.includes(groupKey);
    if (hasGroup) {
      applyChange(value.filter((p) => p !== groupKey && !actions.includes(p)));
    } else {
      const withoutActions = value.filter((p) => !actions.includes(p));
      applyChange([...withoutActions, groupKey]);
    }
  };

  const toggleAction = (groupKey: string, action: string, actions: ReadonlyArray<string>) => {
    if (isAdmin) return;
    const hasGroup = value.includes(groupKey);
    let next: Array<string>;

    if (hasGroup) {
      const remainingActions = actions.filter((a) => a !== action);
      next = [...value.filter((p) => p !== groupKey), ...remainingActions];
    } else if (value.includes(action)) {
      next = value.filter((p) => p !== action);
    } else {
      next = [...value, action];
    }

    const activeActions = actions.filter((a) => next.includes(a));
    if (activeActions.length === actions.length) {
      next = [...next.filter((p) => !actions.includes(p)), groupKey];
    }

    applyChange(next);
  };

  const getGroupState = (groupKey: string, actions: ReadonlyArray<string>): 'none' | 'partial' | 'all' => {
    if (isAdmin || value.includes(groupKey)) return 'all';
    const count = actions.filter((a) => value.includes(a)).length;
    if (count === 0) return 'none';
    if (count === actions.length) return 'all';
    return 'partial';
  };

  const isActionChecked = (groupKey: string, action: string): boolean => {
    return isAdmin || value.includes(groupKey) || value.includes(action);
  };

  return (
    <div className={'space-y-4'}>
      <button
        type={'button'}
        onClick={toggleAdmin}
        disabled={disabled}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
          isAdmin
            ? 'border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-950/30'
            : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600'
        )}
      >
        <Checkbox
          checked={isAdmin}
          onCheckedChange={toggleAdmin}
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
          {...{ disabled }}
        />
        <Shield className={cn('size-4', isAdmin ? 'text-orange-500' : 'text-zinc-400')} strokeWidth={2} />
        <span
          className={cn(
            'text-sm font-medium',
            isAdmin ? 'text-orange-700 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-300'
          )}
        >
          {t('users.allPermissions')}
        </span>
      </button>
      {PERMISSION_TREE.map((section) => (
        <div key={section.section}>
          <span className={'mb-2 block text-[11px] font-semibold tracking-widest text-zinc-400 uppercase dark:text-zinc-500'}>
            {t(`users.permissionGroups.${section.section}`)}
          </span>
          <div className={'space-y-1.5'}>
            {section.groups.map((group) => (
              <PermissionGroupRow
                key={group.key}
                groupKey={group.key}
                actions={group.actions}
                state={getGroupState(group.key, group.actions)}
                isActionChecked={(action) => isActionChecked(group.key, action)}
                onToggleGroup={() => toggleGroup(group.key, group.actions)}
                onToggleAction={(action) => toggleAction(group.key, action, group.actions)}
                disabled={disabled || isAdmin}
                {...{ locked }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PermissionGroupRow({
  groupKey,
  actions,
  state,
  isActionChecked,
  onToggleGroup,
  onToggleAction,
  disabled,
  locked,
}: {
  groupKey: string;
  actions: ReadonlyArray<string>;
  state: 'none' | 'partial' | 'all';
  isActionChecked: (action: string) => boolean;
  onToggleGroup: () => void;
  onToggleAction: (action: string) => void;
  disabled: boolean;
  locked: Set<string>;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 transition-colors',
        state === 'all'
          ? 'border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/60'
          : state === 'partial'
            ? 'border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30'
            : 'border-zinc-200/70 dark:border-zinc-700/50'
      )}
    >
      <div className={'flex items-center gap-2.5'}>
        <Checkbox
          checked={state === 'all' ? true : state === 'partial' ? 'indeterminate' : false}
          onCheckedChange={onToggleGroup}
          {...{ disabled }}
        />
        <button
          type={'button'}
          onClick={onToggleGroup}
          disabled={disabled}
          className={'w-40 shrink-0 cursor-pointer text-left text-sm font-medium text-zinc-700 dark:text-zinc-300'}
        >
          {t(`users.permissionNames.${groupKey}`, { nsSeparator: false })}
        </button>
        <div className={'flex flex-1 flex-wrap gap-1'}>
          {actions.map((action) => {
            const actionLabel = action.split(':').pop() ?? action;
            const checked = isActionChecked(action);
            const isLocked = locked.has(action);
            return (
              <button
                key={action}
                type={'button'}
                onClick={() => !isLocked && onToggleAction(action)}
                disabled={disabled || isLocked}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                  isLocked
                    ? 'cursor-not-allowed border-orange-300/40 bg-orange-100 text-orange-600 dark:border-orange-700/40 dark:bg-orange-500/10 dark:text-orange-600'
                    : checked
                      ? 'cursor-pointer border-zinc-300 bg-zinc-200/80 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200'
                      : 'cursor-pointer border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700/60 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-300',
                  disabled && !isLocked && 'pointer-events-none opacity-50'
                )}
              >
                {t(`users.permissionActions.${actionLabel}`, { defaultValue: actionLabel })}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PERMISSION_DEPENDENCIES: Array<{ requires: Array<string>; ensures: string }> = [
  {
    requires: ['server:power', 'server:power:start', 'server:power:stop', 'server:power:restart'],
    ensures: 'server:console:read',
  },
  {
    requires: ['server:backups', 'server:backups:create'],
    ensures: 'server:files:read:list',
  },
];

function enforceDependencies(perms: Array<string>): Array<string> {
  const result = [...perms];
  for (const dep of PERMISSION_DEPENDENCIES) {
    const hasRequired = dep.requires.some((r) => result.includes(r));
    if (hasRequired && !result.includes(dep.ensures)) {
      const parentGroup = dep.ensures.split(':').slice(0, 2).join(':');
      if (!result.includes(parentGroup)) {
        result.push(dep.ensures);
      }
    }
  }
  return result;
}

function getLockedPermissions(perms: Array<string>): Set<string> {
  const locked = new Set<string>();
  for (const dep of PERMISSION_DEPENDENCIES) {
    const hasRequired = dep.requires.some((r) => perms.includes(r));
    if (hasRequired) {
      locked.add(dep.ensures);
    }
  }
  return locked;
}
