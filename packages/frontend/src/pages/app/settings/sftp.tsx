import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Copy, Info, Loader2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { useSftpInfo } from '@shulkr/frontend/hooks/use_sftp';

export function SettingsSftpPage() {
  const { t } = useTranslation();
  const { data: sftpInfo, isLoading } = useSftpInfo();

  usePageTitle('shulkr • ' + t('nav.settingsSftp'));

  return (
    <PageContent>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title>{t('appSettings.sftp.title')}</FeatureCard.Title>
              <FeatureCard.Description>{t('appSettings.sftp.description')}</FeatureCard.Description>
            </FeatureCard.Content>
          </FeatureCard.Header>
          <FeatureCard.Body>
            {isLoading ? (
              <div className={'py-8'}>
                <Loader2 className={'mx-auto size-5 animate-spin text-zinc-400 dark:text-zinc-500'} />
              </div>
            ) : (
              <div className={'grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-black/5 dark:bg-white/5'}>
                <ConnectionInfoCell label={t('appSettings.sftp.host')} value={sftpInfo?.host ?? '—'} copyable />
                <ConnectionInfoCell label={t('appSettings.sftp.port')} value={String(sftpInfo?.port ?? '—')} copyable />
                <ConnectionInfoCell label={t('appSettings.sftp.username')} value={'shulkr'} copyable />
                <ConnectionInfoCell label={t('appSettings.sftp.password')} value={t('appSettings.sftp.passwordHint')} />
              </div>
            )}
          </FeatureCard.Body>
          <FeatureCard.Footer alert>
            <Alert variant={'warning'}>
              <Info className={'size-4'} />
              <AlertDescription>{t('appSettings.sftp.changePasswordHint')}</AlertDescription>
            </Alert>
          </FeatureCard.Footer>
        </FeatureCard>
      </FeatureCard.Stack>
    </PageContent>
  );
}

function ConnectionInfoCell({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyable) return;
    copyToClipboard(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const Tag = copyable ? 'button' : 'div';

  return (
    <Tag
      type={copyable ? 'button' : undefined}
      onClick={copyable ? handleCopy : undefined}
      className={cn(
        'flex flex-col gap-1 bg-white px-5 py-3.5 text-left dark:bg-zinc-900',
        copyable && 'group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/80'
      )}
    >
      <span className={'text-xs font-medium text-zinc-400 dark:text-zinc-500'}>{label}</span>
      <span className={'flex items-center gap-2'}>
        <span className={'font-jetbrains text-sm font-semibold text-zinc-800 dark:text-zinc-200'}>{value}</span>
        {copyable &&
          (copied ? (
            <CheckCircle2 className={'size-3 text-green-500'} strokeWidth={3} />
          ) : (
            <Copy
              className={
                'size-3 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400'
              }
            />
          ))}
      </span>
    </Tag>
  );
}
