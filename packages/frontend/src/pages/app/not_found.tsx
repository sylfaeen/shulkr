import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export function AppNotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className={'flex flex-1 flex-col items-center justify-center px-4 py-20'}>
      <h1 className={'text-9xl font-bold text-zinc-200 dark:text-zinc-700'}>404</h1>
      <p className={'mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100'}>{t('notFound.title')}</p>
      <p className={'mt-2 mb-8 text-zinc-500 dark:text-zinc-400'}>{t('notFound.message')}</p>
      <Link
        to={'/app'}
        className={
          'inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700'
        }
      >
        <ArrowLeft className={'mr-2 size-4'} strokeWidth={3} />
        {t('notFound.backHome')}
      </Link>
    </main>
  );
}
