import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Download } from 'lucide-react';
import { useShulkrSqlite } from '@shulkr/frontend/hooks/use_shulkr_sqlite';
import { DbViewerContent } from '@shulkr/frontend/features/db_viewer_content';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';

export function SettingsDatabasePage() {
  const { t } = useTranslation();
  const sqlite = useShulkrSqlite();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [verified, setVerified] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);

  usePageTitle('shulkr • ' + t('nav.settingsDatabase'));

  const handleDownload = useCallback(() => {
    const url = `/api/settings/database/download?token=${encodeURIComponent(accessToken ?? '')}`;
    const a = document.createElement('a');
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [accessToken]);

  return (
    <>
      <PageContent fill>
        <div className={'mb-4 flex items-center justify-between gap-3'}>
          <div className={'flex items-center gap-3'}>
            <div className={'flex size-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800'}>
              <Database className={'size-5 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
            </div>
            <div>
              <h2 className={'font-medium text-zinc-800 dark:text-zinc-200'}>{t('appSettings.database.title')}</h2>
              <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{t('appSettings.database.description')}</p>
            </div>
          </div>
          {verified && (
            <Button variant={'secondary'} size={'sm'} onClick={handleDownload} icon={Download}>
              {t('appSettings.database.downloadDatabase')}
            </Button>
          )}
        </div>
        {verified && <DbViewerContent onDownload={handleDownload} {...{ sqlite }} />}
      </PageContent>
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t('appSettings.database.title')}
        description={t('appSettings.database.description')}
        onConfirm={() => setVerified(true)}
      />
    </>
  );
}
