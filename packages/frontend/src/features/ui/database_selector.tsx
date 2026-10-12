import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Checkbox } from '@shulkr/frontend/features/ui/base/checkbox';
import { Label } from '@shulkr/frontend/features/ui/base/label';
import { useDatabases } from '@shulkr/frontend/hooks/use_databases';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { formatFileSize } from '@shulkr/frontend/hooks/use_files';

type DatabaseSelectorProps = {
  serverId: string;
  value: Array<number> | undefined;
  onChange: (ids: Array<number>) => void;
};

// A value left undefined means no choice was made yet: every database gets selected once the list arrives, like the file tree does with files. Renders nothing when the server has no database or the user cannot list them.
export function DatabaseSelector(props: DatabaseSelectorProps) {
  const can = useHasPermission();

  if (!can('server:databases:list')) return null;

  return <DatabaseSelectorList {...props} />;
}

function DatabaseSelectorList({ serverId, value, onChange }: DatabaseSelectorProps) {
  const { t } = useTranslation();
  const { data } = useDatabases(serverId);
  const databases = data?.databases ?? [];
  const selected = value ?? [];
  const selectedCount = databases.filter((database) => selected.includes(database.id)).length;

  useEffect(() => {
    if (value === undefined && data && data.databases.length > 0) onChange(data.databases.map((database) => database.id));
  }, [value, data, onChange]);

  const handleToggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id]);
  };

  if (databases.length === 0) return null;

  return (
    <div>
      <div className={'flex items-center justify-between pb-2'}>
        <span className={'text-sm font-medium text-zinc-600 dark:text-zinc-400'}>{t('backups.databases.title')}</span>
        <div className={'flex items-center gap-1'}>
          <Button
            onClick={() => onChange(databases.map((database) => database.id))}
            variant={'ghost'}
            size={'xs'}
            disabled={selectedCount === databases.length}
          >
            {t('backups.selectAll')}
          </Button>
          <span className={'text-zinc-200 dark:text-zinc-700'}>|</span>
          <Button onClick={() => onChange([])} variant={'ghost'} size={'xs'} disabled={selectedCount === 0}>
            {t('backups.deselectAll')}
          </Button>
        </div>
      </div>
      <div
        role={'group'}
        aria-label={t('backups.databases.title')}
        className={'rounded-lg border border-black/6 bg-zinc-50/80 p-1.5 dark:border-white/8 dark:bg-zinc-900/60'}
      >
        {databases.map((database) => {
          const isSelected = selected.includes(database.id);

          return (
            <Label
              key={database.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60',
                isSelected && 'bg-zinc-100/60 dark:bg-zinc-800/40'
              )}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => handleToggle(database.id)} />
              <Database
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  isSelected ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'
                )}
                strokeWidth={2}
              />
              <span
                className={cn('truncate', isSelected ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400')}
              >
                {database.slug}
              </span>
              <span className={'font-jetbrains truncate text-[11px] text-zinc-400 dark:text-zinc-500'}>{database.dbName}</span>
              {database.sizeBytes !== null && (
                <span className={'font-jetbrains ml-auto shrink-0 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500'}>
                  {formatFileSize(database.sizeBytes)}
                </span>
              )}
            </Label>
          );
        })}
      </div>
      <p className={'mt-1.5 text-xs text-zinc-500 dark:text-zinc-400'}>{t('backups.databases.hint')}</p>
    </div>
  );
}
