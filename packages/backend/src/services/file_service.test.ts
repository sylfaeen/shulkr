import { describe, it, expect } from 'vitest';
import { resolveFilePath } from '@shulkr/backend/services/file_service';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';

describe('file_service', () => {
  it('resolveFilePath rejects path traversal attempts (uses /tmp which exists)', async () => {
    const deps = createTestDeps();
    const result = await resolveFilePath(deps, '/tmp', '../../etc/passwd');
    expect(result.success).toBe(false);
  });
});
