import { describe, it, expect } from 'vitest';
import {
  getSftpInfo,
  listSftpAccounts,
  createSftpAccount,
  updateSftpAccount,
  deleteSftpAccount,
} from '@shulkr/backend/services/sftp_service';

describe('sftp_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof getSftpInfo).toBe('function');
    expect(typeof listSftpAccounts).toBe('function');
    expect(typeof createSftpAccount).toBe('function');
    expect(typeof updateSftpAccount).toBe('function');
    expect(typeof deleteSftpAccount).toBe('function');
  });

  it('getSftpInfo returns server connection info object', () => {
    const info = getSftpInfo();
    expect(info).toHaveProperty('host');
    expect(info).toHaveProperty('port');
  });
});
