import { DEFAULT_DOC_LOCALE, DOC_LOCALES, type DocLocale } from '@shulkr/shared';

import enIntroduction from '@shulkr/shared/docs/en/introduction.md?raw';
import enInstallation from '@shulkr/shared/docs/en/installation.md?raw';
import enConfiguration from '@shulkr/shared/docs/en/configuration.md?raw';
import enTasks from '@shulkr/shared/docs/en/tasks.md?raw';
import enShulkrCore from '@shulkr/shared/docs/en/shulkr-core.md?raw';
import enTroubleshooting from '@shulkr/shared/docs/en/troubleshooting.md?raw';

import frIntroduction from '@shulkr/shared/docs/fr/introduction.md?raw';
import frInstallation from '@shulkr/shared/docs/fr/installation.md?raw';
import frConfiguration from '@shulkr/shared/docs/fr/configuration.md?raw';
import frTasks from '@shulkr/shared/docs/fr/tasks.md?raw';
import frShulkrCore from '@shulkr/shared/docs/fr/shulkr-core.md?raw';
import frTroubleshooting from '@shulkr/shared/docs/fr/troubleshooting.md?raw';

import esIntroduction from '@shulkr/shared/docs/es/introduction.md?raw';
import esInstallation from '@shulkr/shared/docs/es/installation.md?raw';
import esConfiguration from '@shulkr/shared/docs/es/configuration.md?raw';
import esTasks from '@shulkr/shared/docs/es/tasks.md?raw';
import esShulkrCore from '@shulkr/shared/docs/es/shulkr-core.md?raw';
import esTroubleshooting from '@shulkr/shared/docs/es/troubleshooting.md?raw';

import deIntroduction from '@shulkr/shared/docs/de/introduction.md?raw';
import deInstallation from '@shulkr/shared/docs/de/installation.md?raw';
import deConfiguration from '@shulkr/shared/docs/de/configuration.md?raw';
import deTasks from '@shulkr/shared/docs/de/tasks.md?raw';
import deShulkrCore from '@shulkr/shared/docs/de/shulkr-core.md?raw';
import deTroubleshooting from '@shulkr/shared/docs/de/troubleshooting.md?raw';

const docsByLocale: Record<DocLocale, Record<string, string>> = {
  en: {
    introduction: enIntroduction,
    installation: enInstallation,
    configuration: enConfiguration,
    tasks: enTasks,
    'shulkr-core': enShulkrCore,
    troubleshooting: enTroubleshooting,
  },
  fr: {
    introduction: frIntroduction,
    installation: frInstallation,
    configuration: frConfiguration,
    tasks: frTasks,
    'shulkr-core': frShulkrCore,
    troubleshooting: frTroubleshooting,
  },
  es: {
    introduction: esIntroduction,
    installation: esInstallation,
    configuration: esConfiguration,
    tasks: esTasks,
    'shulkr-core': esShulkrCore,
    troubleshooting: esTroubleshooting,
  },
  de: {
    introduction: deIntroduction,
    installation: deInstallation,
    configuration: deConfiguration,
    tasks: deTasks,
    'shulkr-core': deShulkrCore,
    troubleshooting: deTroubleshooting,
  },
};

export function getDocContent(slug: string, language: string): string | undefined {
  const locale = (DOC_LOCALES as ReadonlyArray<string>).includes(language) ? (language as DocLocale) : DEFAULT_DOC_LOCALE;

  return docsByLocale[locale][slug] ?? docsByLocale[DEFAULT_DOC_LOCALE][slug];
}

export { docsSlugs, DEFAULT_DOC_SLUG } from '@shulkr/shared';
