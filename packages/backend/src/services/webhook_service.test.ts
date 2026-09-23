import { describe, it, expect } from 'vitest';
import {
  dispatchWebhooks,
  sendWebhook,
  sendTestWebhook,
  cleanOldWebhookDeliveries,
} from '@shulkr/backend/services/webhook_service';

describe('webhook_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof dispatchWebhooks).toBe('function');
    expect(typeof sendWebhook).toBe('function');
    expect(typeof sendTestWebhook).toBe('function');
    expect(typeof cleanOldWebhookDeliveries).toBe('function');
  });
});
