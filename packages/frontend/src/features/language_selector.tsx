import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@shulkr/frontend/lib/cn';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shulkr/frontend/features/ui/shadcn/dropdown-menu';

const languages = [
  { code: 'en', name: 'English', flagCode: 'gb' },
  { code: 'fr', name: 'Français', flagCode: 'fr' },
  { code: 'es', name: 'Español', flagCode: 'es' },
  { code: 'de', name: 'Deutsch', flagCode: 'de' },
];

export function LanguageSelectorCompact() {
  const { i18n } = useTranslation();
  const persistLocale = useUpdateLocale();
  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];
  const handleSelect = (code: string) => {
    i18n.changeLanguage(code).then();
    persistLocale(code);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type={'button'}
          className={
            'flex size-9 items-center justify-center rounded-lg text-zinc-600 transition-all duration-(--duration-fast) hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }
          aria-label={'Select language'}
        >
          <span className={cn(`fi fi-${currentLang.flagCode}`, 'size-4! rounded-sm')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={'top'} align={'end'}>
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={() => handleSelect(lang.code)}
            className={cn(lang.code === i18n.language && 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400')}
          >
            <span className={cn(`fi fi-${lang.flagCode}`, 'size-4! rounded-sm')} />
            <span className={'flex-1'}>{lang.name}</span>
            {lang.code === i18n.language && <Check className={'size-3.5 text-green-600 dark:text-green-400'} strokeWidth={2} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useUpdateLocale() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateLocale = useMutation({
    mutationFn: async (input: { locale: string }) => {
      const result = await apiClient.users.updateLocale({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
  return (code: string) => {
    if (isAuthenticated) {
      updateLocale.mutate({ locale: code });
    }
  };
}
