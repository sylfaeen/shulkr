import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageLoader() {
  const { t } = useTranslation();

  return (
    <div className={'flex flex-col items-center justify-center space-y-2 py-20'}>
      <LoaderCircle className={'size-8 animate-spin text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
      <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.loading')}</p>
    </div>
  );
}
