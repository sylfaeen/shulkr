import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { useThemeStore } from '@shulkr/frontend/stores/theme_store';

const themes = [
  { value: 'light' as const, icon: Sun, label: 'Light theme' },
  { value: 'inherit' as const, icon: Monitor, label: 'System theme' },
  { value: 'dark' as const, icon: Moon, label: 'Dark theme' },
];

export function ThemeToggle() {
  const { appearance, setAppearance } = useThemeStore();

  return (
    <div
      className={'flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800'}
      role={'radiogroup'}
      aria-label={'Theme'}
    >
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type={'button'}
          role={'radio'}
          aria-checked={appearance === value}
          aria-label={label}
          onClick={() => setAppearance(value)}
          className={cn(
            'flex size-6 items-center justify-center rounded-md transition-colors',
            appearance === value
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          )}
        >
          <Icon className={'size-4'} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}
