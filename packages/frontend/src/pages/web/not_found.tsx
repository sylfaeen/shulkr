import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className={'flex min-h-screen items-center justify-center bg-gray-900 px-4'}>
      <div className={'text-center'}>
        <h1 className={'text-9xl font-bold text-gray-700'}>404</h1>
        <p className={'mt-4 text-2xl font-semibold text-white'}>{t('notFound.title')}</p>
        <p className={'mt-2 mb-8 text-gray-400'}>{t('notFound.message')}</p>
        <Link
          to={'/'}
          className={
            'inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700'
          }
        >
          <ArrowLeft className={'mr-2 size-4'} strokeWidth={3} />
          {t('notFound.backHome')}
        </Link>
      </div>
    </div>
  );
}
