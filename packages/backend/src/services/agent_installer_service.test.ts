import { describe, it, expect } from 'vitest';
import { installAgent, readAgentConfig } from '@shulkr/backend/services/agent_installer_service';

// Smoke test only, installAgent copies the embedded plugin JAR into the server's plugins/ directory and writes shulkr-agent.yml. Full integration belongs in story 59.x once deps.fs is threaded through.
describe('agent_installer_service', () => {
  it('exposes installAgent / readAgentConfig as module-level functions', () => {
    expect(typeof installAgent).toBe('function');
    expect(installAgent.length).toBe(2); // (serverId, platform)
    expect(typeof readAgentConfig).toBe('function');
    expect(readAgentConfig.length).toBe(1); // (serverId)
  });
});
