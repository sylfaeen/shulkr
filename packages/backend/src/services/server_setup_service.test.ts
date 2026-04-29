import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { initializeServer, updateServerPort } from '@shulkr/backend/services/server_setup_service';

describe('server_setup_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('initializeServer writes eula.txt and server.properties via deps.fs', async () => {
    await initializeServer(deps, {
      serverPath: '/srv/test',
      serverName: 'survival',
      javaPort: 25600,
    });
    expect(await deps.fs.exists('/srv/test/eula.txt')).toBe(true);
    expect(await deps.fs.exists('/srv/test/server.properties')).toBe(true);
    const eula = await deps.fs.readFileText('/srv/test/eula.txt');
    expect(eula).toContain('eula=true');
    const props = await deps.fs.readFileText('/srv/test/server.properties');
    expect(props).toContain('server-port=25600');
    expect(props).toContain('motd=survival');
  });

  it('updateServerPort rewrites both server-port and query.port lines', async () => {
    deps.fs.put('/srv/u/server.properties', 'server-port=25565\nquery.port=25565\nother=keep\n');
    await updateServerPort(deps, '/srv/u', 25700);
    const updated = await deps.fs.readFileText('/srv/u/server.properties');
    expect(updated).toContain('server-port=25700');
    expect(updated).toContain('query.port=25700');
    expect(updated).toContain('other=keep');
  });

  it('updateServerPort silently no-ops when server.properties is missing', async () => {
    await expect(updateServerPort(deps, '/srv/missing', 25800)).resolves.toBeUndefined();
  });
});
