import { describe, it, expect } from 'vitest';
import { getJavaPath } from '@shulkr/backend/services/java_service';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';

describe('java_service', () => {
  it('getJavaPath returns null for unknown version names', async () => {
    const deps = createTestDeps();
    expect(await getJavaPath(deps, 'nonexistent-java-version-xyz')).toBeNull();
  });
});
