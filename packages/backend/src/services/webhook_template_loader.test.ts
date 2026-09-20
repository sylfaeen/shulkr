import { describe, it, expect } from 'vitest';
import { loadWebhookTemplates } from '@shulkr/backend/services/webhook_template_loader';

describe('webhook_template_loader', () => {
  it('returns the en bundle for "en"', () => {
    const templates = loadWebhookTemplates('en');
    expect(typeof templates).toBe('object');
    expect(Object.keys(templates).length).toBeGreaterThan(0);
  });

  it('falls back to en for unknown languages', () => {
    const en = loadWebhookTemplates('en');
    const unknown = loadWebhookTemplates('xx' as 'en');
    expect(unknown).toEqual(en);
  });

  it('returns the fr bundle for "fr"', () => {
    const fr = loadWebhookTemplates('fr');
    const en = loadWebhookTemplates('en');
    expect(fr).not.toBe(en); // different reference
  });
});
