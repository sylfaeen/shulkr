import { describe, it, expect } from 'vitest';
import { provisionFirstServerWithDeps, provisionFirstServer } from '@shulkr/backend/services/first_server_provisioning';

// provisionFirstServerWithDeps reaches into serverService.createServer (which touches the real fs to materialize a server directory). A full integration test belongs in story 59.1 once server_service is fully migrated to deps. For now we validate the two exports exist with the expected shapes.
describe('first_server_provisioning', () => {
  it('exposes provisionFirstServerWithDeps(deps, input) and a deprecated facade', () => {
    expect(typeof provisionFirstServerWithDeps).toBe('function');
    expect(provisionFirstServerWithDeps.length).toBe(2);
    expect(typeof provisionFirstServer).toBe('function');
    expect(provisionFirstServer.length).toBe(1);
  });
});
