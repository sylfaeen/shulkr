import { describe, it, expect } from 'vitest';
import { addDomain, listDomainsByServer, removeDomain, enableDomainSsl } from '@shulkr/backend/services/domain_service';

describe('domain_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof addDomain).toBe('function');
    expect(typeof listDomainsByServer).toBe('function');
    expect(typeof removeDomain).toBe('function');
    expect(typeof enableDomainSsl).toBe('function');
  });
});
