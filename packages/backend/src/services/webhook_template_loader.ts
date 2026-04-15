import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebhookLanguage } from '@shulkr/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cache = new Map<string, Record<string, string>>();

const SUPPORTED_LANGUAGES: ReadonlyArray<WebhookLanguage> = ['en', 'fr', 'es', 'de'];

export function loadWebhookTemplates(language: WebhookLanguage): Record<string, string> {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return loadWebhookTemplates('en');
  }

  const cached = cache.get(language);
  if (cached) return cached;

  const filePath = resolve(__dirname, '..', 'webhook-templates', `${language}.json`);
  const raw = readFileSync(filePath, 'utf-8');
  const templates = JSON.parse(raw) as Record<string, string>;
  cache.set(language, templates);
  return templates;
}
