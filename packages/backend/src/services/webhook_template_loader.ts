import type { WebhookLanguage } from '@shulkr/shared';
import en from '@shulkr/backend/webhook-templates/en.json';
import fr from '@shulkr/backend/webhook-templates/fr.json';
import es from '@shulkr/backend/webhook-templates/es.json';
import de from '@shulkr/backend/webhook-templates/de.json';

const templates: Record<string, Record<string, string>> = { en, fr, es, de };

export function loadWebhookTemplates(language: WebhookLanguage): Record<string, string> {
  return templates[language] ?? templates.en;
}
