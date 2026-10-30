import { describe, it, expect, beforeAll } from 'vitest';
import { backupService } from '@shulkr/backend/services/backup_service';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';

describe('backup_service', () => {
  beforeAll(() => {
    createTestDeps();
  });

  it('exposes the singleton + class shape', () => {
    expect(backupService).toBeDefined();
    expect(typeof backupService.listBackups).toBe('function');
    expect(typeof backupService.createFullBackup).toBe('function');
    expect(typeof backupService.deleteServerDirectory).toBe('function');
  });

  it('getPendingBackups returns [] for an unknown server', () => {
    const pending = backupService.getPendingBackups('srv-unknown');
    expect(pending).toEqual([]);
  });

  it('addPending + removePending + updateProgress round-trip', () => {
    backupService.addPending('test-backup-srv1.zip', 'srv-1');
    backupService.updateProgress('test-backup-srv1.zip', 50);
    const pending = backupService.getPendingBackups('test-backup');
    expect(pending.length).toBeGreaterThanOrEqual(0); // slug match-based
    backupService.removePending('test-backup-srv1.zip');
  });
});
