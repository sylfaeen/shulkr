import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { cn } from '@shulkr/frontend/lib/cn';

export function DatabaseCredentialsPanel({
  credentials,
  warning,
  snippet,
}: {
  credentials: { host: string; port: number; dbName: string; username: string; password: string; connectionUrl: string };
  warning?: string;
  snippet?: { label: string; content: string };
}) {
  const { t } = useTranslation();

  const fields = [
    { label: t('databases.credentials.host'), value: credentials.host },
    { label: t('databases.credentials.port'), value: String(credentials.port) },
    { label: t('databases.credentials.database'), value: credentials.dbName },
    { label: t('databases.credentials.username'), value: credentials.username },
    { label: t('databases.credentials.password'), value: credentials.password, secret: true },
  ];

  return (
    <div className={'space-y-4'}>
      <div
        className={
          'border-border grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-black/5 sm:grid-cols-2 dark:bg-white/5'
        }
      >
        {fields.map((field) => (
          <CredentialCell key={field.label} {...field} />
        ))}
      </div>
      <ConnectionUrl url={credentials.connectionUrl} password={credentials.password} />
      {warning && (
        <p className={'flex items-start gap-2 text-sm text-amber-600 dark:text-amber-500'}>
          <TriangleAlert className={'mt-0.5 size-4 shrink-0'} />
          <span>{warning}</span>
        </p>
      )}
      {snippet && <CredentialSnippet {...snippet} />}
    </div>
  );
}

// The URL carries the password, so it is masked on screen exactly like the password field. Copying always copies the real one.
function ConnectionUrl({ url, password }: { url: string; password: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [url]);

  const displayed = revealed ? url : url.replace(encodeURIComponent(password), '\u2022'.repeat(8));

  return (
    <div className={'border-border space-y-1.5 rounded-lg border p-3'}>
      <div className={'flex items-center justify-between gap-2'}>
        <span className={'text-xs font-medium text-zinc-500 dark:text-zinc-400'}>{t('databases.credentials.connectionUrl')}</span>
        <div className={'flex items-center gap-1'}>
          <Button variant={'ghost'} size={'sm'} className={'h-6 px-1.5 text-xs'} onClick={() => setRevealed(!revealed)}>
            {revealed ? '\u2022\u2022\u2022\u2022' : 'abc'}
          </Button>
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
      </div>
      <p className={'font-jetbrains overflow-x-auto text-xs whitespace-nowrap text-zinc-700 dark:text-zinc-300'}>{displayed}</p>
      <p className={'text-xs text-zinc-400 dark:text-zinc-500'}>{t('databases.credentials.connectionUrlHint')}</p>
    </div>
  );
}

function CredentialCell({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  const displayed = secret && !revealed ? '•'.repeat(16) : value;

  return (
    <div className={'flex flex-col gap-1 bg-white px-5 py-3.5 dark:bg-zinc-900'}>
      <span className={'text-xs font-medium text-zinc-400 dark:text-zinc-500'}>{label}</span>
      <div className={'flex items-center gap-2'}>
        <span
          className={cn('font-jetbrains truncate text-sm font-medium text-zinc-800 dark:text-zinc-200', secret && 'select-all')}
        >
          {displayed}
        </span>
        {secret && (
          <Button variant={'ghost'} size={'sm'} className={'h-6 px-1.5 text-xs'} onClick={() => setRevealed(!revealed)}>
            {revealed ? '••••' : 'abc'}
          </Button>
        )}
        <Button
          variant={'ghost'}
          size={'sm'}
          className={'ml-auto size-6 shrink-0 p-0'}
          onClick={handleCopy}
          icon={copied ? Check : Copy}
          iconClass={copied ? 'size-3 text-green-500' : 'size-3'}
        />
      </div>
    </div>
  );
}

function CredentialSnippet({ label, content }: { label: string; content: string }) {
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

// The snippet turns five values into one paste. Without it the administrator retypes each field by hand and gets one of them wrong.
export function buildPluginSnippet(credentials: {
  host: string;
  port: number;
  dbName: string;
  username: string;
  password: string;
}) {
  return [
    'database:',
    `  host: ${credentials.host}`,
    `  port: ${credentials.port}`,
    `  database: ${credentials.dbName}`,
    `  user: ${credentials.username}`,
    `  password: "${credentials.password}"`,
  ].join('\n');
}

export function buildLaravelSnippet(
  credentials: { host: string; port: number; dbName: string; username: string; password: string },
  requiresCertificate: boolean
) {
  const lines = [
    "'shulkr' => [",
    "    'driver' => 'mysql',",
    `    'host' => '${credentials.host}',`,
    `    'port' => '${credentials.port}',`,
    `    'database' => '${credentials.dbName}',`,
    `    'username' => '${credentials.username}',`,
    "    'password' => env('SHULKR_DB_PASSWORD'),",
  ];

  if (requiresCertificate) {
    lines.push(
      "    'options' => [PDO::MYSQL_ATTR_SSL_CA => env('SHULKR_DB_SSL_CA'), PDO::MYSQL_ATTR_SSL_CERT => env('SHULKR_DB_SSL_CERT'), PDO::MYSQL_ATTR_SSL_KEY => env('SHULKR_DB_SSL_KEY')],"
    );
  } else {
    lines.push("    'options' => [PDO::MYSQL_ATTR_SSL_CA => env('SHULKR_DB_SSL_CA')],");
  }

  lines.push('],');

  return lines.join('\n');
}
