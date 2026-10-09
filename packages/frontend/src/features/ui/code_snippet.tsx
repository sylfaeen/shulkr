import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';

export function CodeSnippet({ label, content }: { label: string; content: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <div className={'overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800'}>
      <div
        className={
          'flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900'
        }
      >
        <span className={'text-xs font-medium text-zinc-500 dark:text-zinc-400'}>{label}</span>
        <Button
          variant={'ghost'}
          size={'sm'}
          className={'h-6 px-2 text-xs'}
          onClick={handleCopy}
          icon={copied ? Check : Copy}
          iconClass={'size-3'}
        >
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <pre className={'font-jetbrains overflow-x-auto bg-white p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'}>
        {content}
      </pre>
    </div>
  );
}
