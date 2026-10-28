import { describe, it, expect } from 'vitest';
import { evaluateAlerts, cleanOldAlertEvents } from '@shulkr/backend/services/alert_service';

describe('alert_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof evaluateAlerts).toBe('function');
    expect(typeof cleanOldAlertEvents).toBe('function');
  });
});
