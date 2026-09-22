import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { databaseAccesses, firewallRules, servers } from '@shulkr/backend/db/schema';
import { createTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { createServerDatabase, getServerDatabase } from '@shulkr/backend/services/database_service';
import {
  createDatabaseAccess,
  getDatabaseAccess,
  listDatabaseAccesses,
  readAccessCredentials,
  revokeDatabaseAccess,
  rotateAccessPassword,
} from '@shulkr/backend/services/database_access_service';
import type { ServerDatabaseRow } from '@shulkr/backend/db/schema';

// createTestDeps shares one in-memory database per worker, and "first remote access" is a property of the whole instance. Each test starts from a clean slate.
beforeEach(async () => {
  const deps = createTestDeps();
  await deps.db.delete(databaseAccesses);
  await deps.db.delete(firewallRules);
});

function callsWithAction(deps: TestDeps, action: string) {
  return deps.shell.calls.filter((call) => call.command === deps.config.DATABASE_SCRIPT_PATH && call.args[0] === action);
}

async function seedDatabase(deps: TestDeps): Promise<{ row: ServerDatabaseRow; prefix: string }> {
  const server = seedServer(deps);
  const created = await createServerDatabase(deps, { serverId: server.id, slug: 'flyteams' });
  const row = (await getServerDatabase(deps, created.database.id))!;
  const [record] = await deps.db.select({ db_prefix: servers.db_prefix }).from(servers).where(eq(servers.id, server.id));

  return { row, prefix: record.db_prefix! };
}

describe('createDatabaseAccess', () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  it('grants a read-only access pinned to one IP and returns its credentials once', async () => {
    const { row, prefix } = await seedDatabase(deps);

    const result = await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    expect(result.access.scope).toBe('read');
    expect(result.access.allowedIp).toBe('82.64.12.34');
    expect(result.access.username).toMatch(/^a_[0-9a-f]{6}_[0-9a-f]{4}$/);
    expect(result.credentials.password.length).toBeGreaterThanOrEqual(24);
    expect(result.credentials.caCertificateUrl).toBe('/api/databases/engine/ca');

    const grant = callsWithAction(deps, 'grant-access');
    expect(grant).toHaveLength(1);
    expect(grant[0].args).toEqual(['grant-access', row.db_name, result.access.username, '82.64.12.34', 'read', 'ssl']);
  });

  it('sends the access password on stdin, never as an argument', async () => {
    const { row, prefix } = await seedDatabase(deps);

    const result = await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    const grant = callsWithAction(deps, 'grant-access')[0];
    expect(grant.args).not.toContain(result.credentials.password);
    expect(deps.shell.lastSpawnHandle()?.stdinHistory().join('')).toBe(`${result.credentials.password}\n`);
  });

  it('asks for a client certificate when the access requires one', async () => {
    const { row, prefix } = await seedDatabase(deps);

    await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: true,
    });

    expect(callsWithAction(deps, 'grant-access')[0].args[5]).toBe('x509');
  });

  it('opens the firewall for that IP only', async () => {
    const { row, prefix } = await seedDatabase(deps);

    await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    const rules = await deps.db.select().from(firewallRules);
    const rule = rules.find((entry) => entry.port === '3306');

    expect(rule).toBeDefined();
    expect(rule?.from_ip).toBe('82.64.12.34');
    expect(rule?.action).toBe('allow');
  });

  // bind-address is instance-wide: the engine only starts listening off the loopback when a remote access actually exists.
  it('switches the engine bind on the first remote access and not on the next one', async () => {
    const { row, prefix } = await seedDatabase(deps);

    const first = await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    expect(first.engineRestarted).toBe(true);
    expect(callsWithAction(deps, 'set-bind')[0].args).toEqual(['set-bind', '0.0.0.0']);

    const second = await createDatabaseAccess(deps, row, prefix, {
      label: 'backoffice',
      scope: 'read',
      allowedIp: '82.64.12.35',
      requireCertificate: false,
    });

    expect(second.engineRestarted).toBe(false);
    expect(callsWithAction(deps, 'set-bind')).toHaveLength(1);
  });

  it('rejects an identical access on the same database, IP and scope', async () => {
    const { row, prefix } = await seedDatabase(deps);
    const input = { label: 'flycraft-site', scope: 'read' as const, allowedIp: '82.64.12.34', requireCertificate: false };

    await createDatabaseAccess(deps, row, prefix, input);

    await expect(createDatabaseAccess(deps, row, prefix, { ...input, label: 'duplicate' })).rejects.toThrow(
      ErrorCodes.DATABASE_ACCESS_IP_TAKEN
    );
  });

  // The grant succeeds, then the firewall refuses. Without the rollback, MariaDB would hold a user that the panel does not know about and nobody can revoke from the UI.
  it('revokes the MariaDB user when the firewall rule cannot be applied', async () => {
    const { row, prefix } = await seedDatabase(deps);
    deps.shell.mockRun('sudo', { success: false, stdout: '', stderr: 'ufw failed', exitCode: 1 });

    await expect(
      createDatabaseAccess(deps, row, prefix, {
        label: 'flycraft-site',
        scope: 'read',
        allowedIp: '82.64.12.34',
        requireCertificate: false,
      })
    ).rejects.toThrow();

    expect(callsWithAction(deps, 'revoke-access')).toHaveLength(1);

    const rows = await deps.db.select().from(databaseAccesses).where(eq(databaseAccesses.database_id, row.id));
    expect(rows).toHaveLength(0);
  });

  it('never exposes a password in the listing', async () => {
    const { row, prefix } = await seedDatabase(deps);

    await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    expect(JSON.stringify(await listDatabaseAccesses(deps, row.id))).not.toContain('password');
  });
});

describe('rotateAccessPassword', () => {
  it('rotates without touching the scope or the allowed IP', async () => {
    const deps = createTestDeps();
    const { row, prefix } = await seedDatabase(deps);

    const created = await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    const access = (await getDatabaseAccess(deps, created.access.id))!;
    const rotated = await rotateAccessPassword(deps, access, row.db_name);

    expect(rotated.password).not.toBe(created.credentials.password);
    expect(callsWithAction(deps, 'rotate-password')[0].args).toEqual(['rotate-password', access.username, '82.64.12.34']);

    const reloaded = (await getDatabaseAccess(deps, created.access.id))!;
    expect(reloaded.scope).toBe('read');
    expect(reloaded.allowed_ip).toBe('82.64.12.34');
    expect(readAccessCredentials(deps, reloaded, row.db_name).password).toBe(rotated.password);
  });
});

describe('revokeDatabaseAccess', () => {
  it('drops the user, closes the firewall and returns the engine to the loopback', async () => {
    const deps = createTestDeps();
    const { row, prefix } = await seedDatabase(deps);

    const created = await createDatabaseAccess(deps, row, prefix, {
      label: 'flycraft-site',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    const access = (await getDatabaseAccess(deps, created.access.id))!;
    const result = await revokeDatabaseAccess(deps, access);

    expect(callsWithAction(deps, 'revoke-access')[0].args).toEqual(['revoke-access', access.username, '82.64.12.34']);
    expect(result.engineRestarted).toBe(true);
    expect(callsWithAction(deps, 'set-bind').at(-1)?.args).toEqual(['set-bind', '127.0.0.1']);

    const rules = await deps.db.select().from(firewallRules);
    expect(rules.find((entry) => entry.port === '3306' && entry.from_ip === '82.64.12.34')).toBeUndefined();
    expect(await getDatabaseAccess(deps, created.access.id)).toBeNull();
  });

  // Two accesses share one firewall rule per IP. Closing the port for the first one would silently break the second.
  it('keeps the firewall rule while another access still uses that IP', async () => {
    const deps = createTestDeps();
    const { row, prefix } = await seedDatabase(deps);

    const read = await createDatabaseAccess(deps, row, prefix, {
      label: 'site-read',
      scope: 'read',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    await createDatabaseAccess(deps, row, prefix, {
      label: 'site-write',
      scope: 'write',
      allowedIp: '82.64.12.34',
      requireCertificate: false,
    });

    const access = (await getDatabaseAccess(deps, read.access.id))!;
    const result = await revokeDatabaseAccess(deps, access);

    expect(result.engineRestarted).toBe(false);

    const rules = await deps.db.select().from(firewallRules);
    expect(rules.find((entry) => entry.port === '3306' && entry.from_ip === '82.64.12.34')).toBeDefined();
  });
});
