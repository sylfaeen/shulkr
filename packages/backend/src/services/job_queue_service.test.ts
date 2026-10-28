import { describe, it, expect } from 'vitest';
import { jobQueueService } from '@shulkr/backend/services/job_queue_service';

// Smoke test only, jobQueueService runs polling + spawns task executors (restart, backup, command, chain) that touch the real OS. Full integration belongs in story 59.x.
describe('job_queue_service', () => {
  it('exposes the singleton with initialize / enqueue / shutdown', () => {
    expect(typeof jobQueueService.initialize).toBe('function');
    expect(typeof jobQueueService.enqueue).toBe('function');
    expect(typeof jobQueueService.shutdown).toBe('function');
  });
});
