import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/base/select';

export type SortDirection = 'asc' | 'desc';

export type SortField<T> = {
  key: string;
  label: string;
  accessor: (item: T) => string | number | null | undefined;
  type?: 'text' | 'number' | 'date';
};

type Options<T> = {
  fields: ReadonlyArray<SortField<T>>;
  defaultKey?: string;
  defaultDirection?: SortDirection;
  storageKey?: string;
};

export function useSortableList<T>(items: ReadonlyArray<T> | undefined, options: Options<T>) {
  const { fields, defaultKey, defaultDirection = 'asc', storageKey } = options;
  const initialKey = defaultKey ?? fields[0]?.key ?? '';
  const [sortKey, setSortKey] = useState<string>(() => readPersisted(storageKey, 'key') ?? initialKey);

  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => (readPersisted(storageKey, 'dir') as SortDirection | null) ?? defaultDirection
  );

  const activeField = fields.find((f) => f.key === sortKey) ?? fields[0];

  const sorted = useMemo(() => {
    if (!items || !activeField) return items ?? [];
    const factor = sortDirection === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => factor * compare(activeField.accessor(a), activeField.accessor(b), activeField.type));
  }, [items, activeField, sortDirection]);

  const handleKeyChange = (next: string) => {
    setSortKey(next);
    persist(storageKey, 'key', next);
  };

  const handleDirectionToggle = () => {
    const next: SortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    setSortDirection(next);
    persist(storageKey, 'dir', next);
  };

  const control = (
    <SortMenu
      fields={fields}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onKeyChange={handleKeyChange}
      onDirectionToggle={handleDirectionToggle}
    />
  );

  return { items: sorted, sortKey, sortDirection, control };
}

function compare(a: unknown, b: unknown, type: SortField<unknown>['type']): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (type === 'number') return Number(a) - Number(b);
  if (type === 'date') return new Date(String(a)).getTime() - new Date(String(b)).getTime();

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function persist(storageKey: string | undefined, suffix: 'key' | 'dir', value: string) {
  if (!storageKey || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(`sort:${storageKey}:${suffix}`, value);
  } catch {}
}

function readPersisted(storageKey: string | undefined, suffix: 'key' | 'dir'): string | null {
  if (!storageKey || typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(`sort:${storageKey}:${suffix}`);
  } catch {
    return null;
  }
}

function SortMenu<T>({
  fields,
  sortKey,
  sortDirection,
  onKeyChange,
  onDirectionToggle,
}: {
  fields: ReadonlyArray<SortField<T>>;
  sortKey: string;
  sortDirection: SortDirection;
  onKeyChange: (key: string) => void;
  onDirectionToggle: () => void;
}) {
  const { t } = useTranslation();
  const Icon = sortDirection === 'asc' ? ArrowDownNarrowWide : ArrowUpNarrowWide;
  const directionLabel = sortDirection === 'asc' ? t('common.sort.ascending') : t('common.sort.descending');

  return (
    <div className={'flex items-center gap-1.5'}>
      <span className={'text-[11px] font-normal text-zinc-400 dark:text-zinc-500'}>{t('common.sort.sortedBy')}</span>
      {fields.length > 1 && (
        <Select value={sortKey} onValueChange={(value) => value && onKeyChange(value)}>
          <SelectTrigger
            size={'sm'}
            className={
              'h-6! w-auto gap-1 rounded-sm border border-dashed border-zinc-300 bg-transparent py-0 pr-1 pl-1.5 text-[11px] leading-none font-medium text-zinc-600 shadow-none hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:bg-zinc-50 focus-visible:ring-0 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200 [&_svg:not([class*=size-])]:size-2.5'
            }
            aria-label={t('common.sort.label')}
          >
            <SelectValue placeholder={t('common.sort.label')} />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field.key} value={field.key}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant={'ghost'}
        size={'icon-xs'}
        icon={Icon}
        iconClass={'size-3'}
        onClick={onDirectionToggle}
        aria-label={directionLabel}
        title={directionLabel}
      />
    </div>
  );
}
