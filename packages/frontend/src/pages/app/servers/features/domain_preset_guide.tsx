import { Trans, useTranslation } from 'react-i18next';
import { CodeSnippet } from '@shulkr/frontend/features/ui/code_snippet';

// Default web ports of each plugin, from their own wikis. The subdomain only feeds the placeholder and the config snippets until a domain is typed.
export const DOMAIN_PRESETS: Array<{ key: 'plan' | 'dynmap'; label: string; port: number; subdomain: string }> = [
  { key: 'plan', label: 'Plan', port: 8804, subdomain: 'plan' },
  { key: 'dynmap', label: 'Dynmap', port: 8123, subdomain: 'map' },
];

export type DomainPreset = (typeof DOMAIN_PRESETS)[number];

// Steps follow the order the work can be done in: DNS and the plugin config can be prepared before the domain exists, SSL only once it is added. sslState picks the SSL step wording: the add dialog, a domain row still on HTTP, or one already secured.
export function DomainPresetGuide({
  preset,
  domain,
  port,
  sslState,
}: {
  preset: DomainPreset;
  domain: string;
  port: number;
  sslState: 'notAdded' | 'disabled' | 'enabled';
}) {
  const { t } = useTranslation();
  const values = { domain, port, name: preset.label };
  const sslKey = { notAdded: 'ssl', disabled: 'sslPending', enabled: 'sslEnabled' }[sslState];

  const code = (
    <code
      className={'font-jetbrains rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'}
    />
  );

  const guides: Record<
    DomainPreset['key'],
    { steps: Array<{ key: string; snippet?: { label: string; content: string } }>; notes: Array<string> }
  > = {
    plan: {
      steps: [
        { key: 'dns' },
        {
          key: 'plan.config',
          snippet: {
            label: 'plugins/Plan/config.yml',
            content: [
              'Webserver:',
              `    Port: ${port}`,
              '    Alternative_IP:',
              '        Enabled: true',
              `        Address: ${domain}`,
              '    Security:',
              '        SSL_certificate:',
              '            KeyStore_path: proxy',
              '        Use_X-Forwarded-For_Header: true',
            ].join('\n'),
          },
        },
        { key: sslKey },
        { key: 'plan.account' },
      ],
      notes: ['firewall', 'plan.keystore', 'plan.network', 'plan.multiple'],
    },
    dynmap: {
      steps: [
        { key: 'dns' },
        { key: 'dynmap.config', snippet: { label: 'plugins/dynmap/configuration.txt', content: `webserver-port: ${port}` } },
        { key: sslKey },
        {
          key: 'dynmap.login',
          snippet: {
            label: 'plugins/dynmap/configuration.txt',
            content: ['login-enabled: true', 'login-required: true'].join('\n'),
          },
        },
      ],
      notes: ['firewall', 'dynmap.bind', 'dynmap.proxies', 'dynmap.multiple'],
    },
  };

  const guide = guides[preset.key];

  return (
    <div className={'space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800'}>
      <p className={'text-sm font-medium text-zinc-900 dark:text-zinc-100'}>{t('settings.domains.guide.title', values)}</p>
      <ol className={'space-y-3'}>
        {guide.steps.map((step, index) => (
          <li key={step.key} className={'flex gap-3'}>
            <span
              className={
                'flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-300'
              }
            >
              {index + 1}
            </span>
            <div className={'min-w-0 flex-1 space-y-2'}>
              <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>
                <Trans i18nKey={`settings.domains.guide.${step.key}`} values={values} components={{ code }} />
              </p>
              {step.snippet && <CodeSnippet {...step.snippet} />}
            </div>
          </li>
        ))}
      </ol>
      <div className={'space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800'}>
        <p className={'text-xs font-medium tracking-wider text-zinc-400 uppercase'}>{t('settings.domains.guide.notes')}</p>
        <ul className={'list-disc space-y-1.5 pl-4 text-sm text-zinc-600 dark:text-zinc-400'}>
          {guide.notes.map((note) => (
            <li key={note}>
              <Trans i18nKey={`settings.domains.guide.${note}`} values={values} components={{ code }} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
