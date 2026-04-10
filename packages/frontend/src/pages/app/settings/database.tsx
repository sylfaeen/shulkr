import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import { useShulkrSqlite } from '@shulkr/frontend/hooks/use_shulkr_sqlite';
import { DbViewerContent } from '@shulkr/frontend/features/db_viewer/db_viewer_content';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function SettingsDatabasePage() {
  const { t } = useTranslation();
  const sqlite = useShulkrSqlite();

  usePageTitle('shulkr • ' + t('nav.settingsDatabase'));

  return (
    <PageContent fill>
      <div className={'mb-4 flex items-center gap-3'}>
        <div className={'flex size-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800'}>
          <Database className={'size-5 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
        </div>
        <div>
          <h2 className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{t('appSettings.database.title')}</h2>
          <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{t('appSettings.database.description')}</p>
        </div>
      </div>
      <DbViewerContent {...{ sqlite }} />
    </PageContent>
  );
}
