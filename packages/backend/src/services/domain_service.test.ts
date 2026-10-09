import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createTestDeps, cleanupTestDeps, resetTestDb, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { customDomains } from '@shulkr/backend/db/schema';
import { ENV_PATH } from '@shulkr/backend/services/env_service';
import { ErrorCodes } from '@shulkr/shared';
import {
  addDomain,
  DomainDnsMismatchError,
  DomainSslError,
  enableDomainSsl,
  getPanelDomain,
  listDomainsByServer,
  removeDomain,
  setPanelDomain,
} from '@shulkr/backend/services/domain_service';

const SERVER_IP = '203.0.113.10';

// Mirrors the JSON printed by the update-panel and enable-ssl actions, and by json_error on failure.
const updatePanelOk = {
  success: true,
  stdout: '{"success":true,"action":"update-panel","domain":"panel.example.com"}',
  stderr: '',
  exitCode: 0,
};

const enableSslOk = {
  success: true,
  stdout: '{"success":true,"action":"enable-ssl","domain":"panel.example.com","ssl_expires_at":"Dec 22 10:00:00 2026 GMT"}',
  stderr: '',
  exitCode: 0,
};

const enableSslFailed = {
  success: false,
  stdout: '',
  stderr: '{"success":false,"error":"Certbot failed for panel.example.com: Timeout during connect (likely firewall problem)"}',
  exitCode: 1,
};

// Mirrors the JSON printed by the dns-check action of scripts/subs/subs_domain.sh.
function dnsCheckOutput(resolvedIp: string, matches: boolean) {
  return {
    success: true,
    stdout: JSON.stringify({ matches, resolved_ip: resolvedIp, server_ip: SERVER_IP }),
    stderr: '',
    exitCode: 0,
  };
}

describe('domain_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof addDomain).toBe('function');
    expect(typeof listDomainsByServer).toBe('function');
    expect(typeof removeDomain).toBe('function');
    expect(typeof enableDomainSsl).toBe('function');
  });

  describe('setPanelDomain', () => {
    let deps: TestDeps;

    beforeAll(() => {
      deps = createTestDeps();
    });

    afterEach(() => {
      cleanupTestDeps(deps);
      resetTestDb();
    });

    // Script actions issued through sudo, in call order (args[0] is the script path). Service restarts fire from a timer and can land during a later test, so they are left out.
    function scriptActions() {
      return deps.shell.calls.filter((call) => call.args[0] !== 'systemctl').map((call) => call.args[1]);
    }

    it('refuses a domain that resolves to another IP and leaves nginx untouched', async () => {
      deps.shell.mockRun('sudo', dnsCheckOutput('104.16.1.1', false));
      deps.dns.mockResolve4('panel.example.dev', ['104.16.1.1'], '1.1.1.1');

      await expect(setPanelDomain(deps, 'panel.example.dev', 3001)).rejects.toMatchObject({
        code: ErrorCodes.DOMAIN_DNS_MISMATCH,
        reason: 'mismatch',
        resolvedIp: '104.16.1.1',
        serverIp: SERVER_IP,
      });

      expect(scriptActions()).toEqual(['dns-check']);
      expect(await getPanelDomain(deps)).toBeNull();
    });

    it('refuses a domain that does not resolve yet', async () => {
      deps.shell.mockRun('sudo', dnsCheckOutput('', false));

      const error = await setPanelDomain(deps, 'panel.example.com', 3001).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainDnsMismatchError);
      expect(error).toMatchObject({ reason: 'unresolved', resolvedIp: null, serverIp: SERVER_IP });
      expect(scriptActions()).toEqual(['dns-check']);
    });

    // The record was fixed at the registrar but this server's resolver still serves the old answer until the TTL expires. Telling the user to edit an already-correct DNS zone is the trap this case exists to avoid.
    it('reports a stale resolver cache as propagating when public resolvers already see this server', async () => {
      deps.shell.mockRun('sudo', dnsCheckOutput('104.16.1.1', false));
      deps.dns.mockResolve4('panel.example.com', [SERVER_IP], '1.1.1.1');

      const error = await setPanelDomain(deps, 'panel.example.com', 3001).catch((e: unknown) => e);

      expect(error).toMatchObject({ reason: 'propagating', resolvedIp: '104.16.1.1', serverIp: SERVER_IP });
      expect((error as DomainDnsMismatchError).message).toContain('Retry in a few minutes');
      expect(scriptActions()).toEqual(['dns-check']);
    });

    it('falls back to the public answer when the local resolver returns nothing', async () => {
      deps.shell.mockRun('sudo', dnsCheckOutput('', false));
      deps.dns.mockResolve4('panel.example.com', ['104.16.1.1'], '8.8.8.8');

      await expect(setPanelDomain(deps, 'panel.example.com', 3001)).rejects.toMatchObject({
        reason: 'mismatch',
        resolvedIp: '104.16.1.1',
      });
    });

    it('keeps the current panel domain when the new one fails the DNS check', async () => {
      await deps.db.insert(customDomains).values({ server_id: null, domain: 'old.example.com', port: 3001, type: 'panel' });
      deps.shell.mockRun('sudo', dnsCheckOutput('104.16.1.1', false));

      await expect(setPanelDomain(deps, 'new.example.com', 3001)).rejects.toBeInstanceOf(DomainDnsMismatchError);
      expect(scriptActions()).not.toContain('reset-panel');
      expect((await getPanelDomain(deps))?.domain).toBe('old.example.com');
    });

    it('configures the domain and its certificate as one operation, then switches the panel to https', async () => {
      deps.fs.put(ENV_PATH, `CORS_ORIGIN=http://${SERVER_IP}\nSECURE_COOKIES=false\n`);
      deps.shell.mockRun('sudo', dnsCheckOutput(SERVER_IP, true));
      deps.shell.mockRun('sudo', updatePanelOk);
      deps.shell.mockRun('sudo', enableSslOk);

      const created = await setPanelDomain(deps, 'panel.example.com', 3001);

      expect(created).toMatchObject({
        domain: 'panel.example.com',
        type: 'panel',
        server_id: null,
        ssl_enabled: true,
        ssl_expires_at: 'Dec 22 10:00:00 2026 GMT',
      });

      expect(scriptActions()).toEqual(['dns-check', 'update-panel', 'enable-ssl']);
      // A matching local answer settles it, no public resolver is queried.
      expect(deps.dns.lookups).toEqual([]);
      const env = await deps.fs.readFileText(ENV_PATH);
      expect(env).toContain('CORS_ORIGIN=https://panel.example.com');
      expect(env).toContain('SECURE_COOKIES=true');
    });

    it('rolls nginx back to IP access and stores nothing when the certificate fails', async () => {
      deps.fs.put(ENV_PATH, `CORS_ORIGIN=http://${SERVER_IP}\nSECURE_COOKIES=false\n`);
      deps.shell.mockRun('sudo', dnsCheckOutput(SERVER_IP, true));
      deps.shell.mockRun('sudo', updatePanelOk);
      deps.shell.mockRun('sudo', enableSslFailed);

      const error = await setPanelDomain(deps, 'panel.example.com', 3001).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainSslError);
      expect(error).toMatchObject({ code: ErrorCodes.DOMAIN_SSL_FAILED });
      expect((error as DomainSslError).detail).toContain('Timeout during connect');
      expect(scriptActions()).toEqual(['dns-check', 'update-panel', 'enable-ssl', 'reset-panel']);
      expect(await getPanelDomain(deps)).toBeNull();
      expect(await deps.fs.readFileText(ENV_PATH)).toBe(`CORS_ORIGIN=http://${SERVER_IP}\nSECURE_COOKIES=false\n`);
    });

    it('never leaves the previous domain half configured when its replacement fails the certificate', async () => {
      await deps.db
        .insert(customDomains)
        .values({ server_id: null, domain: 'old.example.com', port: 3001, type: 'panel', ssl_enabled: true });

      deps.fs.put(ENV_PATH, 'CORS_ORIGIN=https://old.example.com\nSECURE_COOKIES=true\n');
      deps.shell.mockRun('sudo', dnsCheckOutput(SERVER_IP, true));
      // First reset-panel detaches the previous domain.
      deps.shell.mockRun('sudo', { success: true, stdout: '{"success":true,"action":"reset-panel"}', stderr: '', exitCode: 0 });
      deps.shell.mockRun('sudo', updatePanelOk);
      deps.shell.mockRun('sudo', enableSslFailed);

      await expect(setPanelDomain(deps, 'panel.example.com', 3001)).rejects.toBeInstanceOf(DomainSslError);

      expect(scriptActions()).toEqual(['dns-check', 'reset-panel', 'update-panel', 'enable-ssl', 'reset-panel']);
      expect(await getPanelDomain(deps)).toBeNull();
      const env = await deps.fs.readFileText(ENV_PATH);
      expect(env).not.toContain('old.example.com');
      expect(env).toContain('SECURE_COOKIES=false');
    });

    it('does not attempt a certificate when update-panel fails', async () => {
      deps.shell.mockRun('sudo', dnsCheckOutput(SERVER_IP, true));

      deps.shell.mockRun('sudo', {
        success: false,
        stdout: '',
        stderr:
          '{"success":false,"error":"Nginx configuration test failed after updating panel domain. Rolled back to default."}',
        exitCode: 1,
      });

      await expect(setPanelDomain(deps, 'panel.example.com', 3001)).rejects.toThrow('Nginx configuration test failed');
      expect(scriptActions()).toEqual(['dns-check', 'update-panel']);
      expect(await getPanelDomain(deps)).toBeNull();
    });
  });
});
