import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { getAllServers, getServerById, getNextAvailablePort, isPortAvailable } from '@shulkr/backend/services/server_service';
import { DEFAULT_JAVA_PORT } from '@shulkr/shared';

describe('server_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    deps = createTestDeps();
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('getNextAvailablePort returns DEFAULT_JAVA_PORT when no servers exist', async () => {
    const port = await getNextAvailablePort(deps);
    expect(port).toBe(DEFAULT_JAVA_PORT);
  });

  it('getNextAvailablePort skips used ports', async () => {
    seedServer(deps, { javaPort: DEFAULT_JAVA_PORT });
    const port = await getNextAvailablePort(deps);
    expect(port).toBe(DEFAULT_JAVA_PORT + 1);
  });

  it('isPortAvailable returns false for taken ports, true otherwise', async () => {
    const taken = 25600;
    seedServer(deps, { javaPort: taken });
    expect(await isPortAvailable(deps, taken)).toBe(false);
    expect(await isPortAvailable(deps, taken + 1)).toBe(true);
  });

  it('getAllServers returns rows with status="stopped" for unstarted servers', async () => {
    seedServer(deps, { id: 'srv-listing-test', javaPort: 25700 });
    const all = await getAllServers(deps);
    const found = all.find((s) => s.id === 'srv-listing-test');
    expect(found).toBeDefined();
    expect(found?.status).toBe('stopped');
  });

  it('getServerById returns null for missing ids', async () => {
    const result = await getServerById(deps, 'srv-does-not-exist');
    expect(result).toBeNull();
  });
});
