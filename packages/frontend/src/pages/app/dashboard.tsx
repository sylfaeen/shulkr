import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';

export function DashboardPage() {
  const { t } = useTranslation();
  usePageTitle('shulkr • ' + t('nav.dashboard'));
  return (
    <PageContent>
      <div className={'space-y-8'}>
        <div>
          <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>{t('dashboard.title')}</h1>
          <p className={'mt-1 text-zinc-600 dark:text-zinc-400'}>{t('dashboard.welcome')}</p>
        </div>
      </div>
    </PageContent>
  );
}
