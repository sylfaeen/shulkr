import { describe, it, expect } from 'vitest';
import { taskScheduler } from '@shulkr/backend/services/task_scheduler';

// Smoke test only, taskScheduler runs an interval that polls the DB and enqueues jobs. Full integration belongs in story 59.x.
describe('task_scheduler', () => {
  it('exposes the singleton with initialize / scheduleTask / shutdown', () => {
    expect(typeof taskScheduler.initialize).toBe('function');
    expect(typeof taskScheduler.scheduleTask).toBe('function');
    expect(typeof taskScheduler.shutdown).toBe('function');
  });
});
