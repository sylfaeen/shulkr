import { describe, it, expect, beforeEach } from 'vitest';
import { createSqlite, type SqliteHandle } from '@shulkr/backend/db';
import { initializeDatabase } from '@shulkr/backend/db/migrate';

describe('initializeDatabase, Geyser NetherNet firewall migration', () => {
  let sqlite: SqliteHandle;

  function insertRule(rule: { action: string; port: string | null; protocol: string; from_ip?: string | null; label: string }) {
    sqlite
      .prepare('INSERT INTO firewall_rules (action, port, protocol, from_ip, label) VALUES (?, ?, ?, ?, ?)')
      .run(rule.action, rule.port, rule.protocol, rule.from_ip ?? null, rule.label);
  }

  function protocolOf(label: string) {
    const row = sqlite.prepare('SELECT protocol FROM firewall_rules WHERE label = ?').get(label) as { protocol: string };

    return row.protocol;
  }

  // Simulates an install upgraded from a version that predates the migration: tables exist, rows exist, user_version is still 0.
  async function upgradeFromPreviousVersion() {
    sqlite.pragma('user_version = 0');
    await initializeDatabase(sqlite);
  }

  beforeEach(async () => {
    sqlite = createSqlite(':memory:');
    await initializeDatabase(sqlite);
  });

  it('widens the UDP-only Bedrock allow rule to TCP+UDP', async () => {
    insertRule({ action: 'allow', port: '19132', protocol: 'udp', label: 'GeyserMC (Bedrock)' });

    await upgradeFromPreviousVersion();

    expect(protocolOf('GeyserMC (Bedrock)')).toBe('both');
  });

  it('keeps the source IP restriction of the widened rule', async () => {
    insertRule({ action: 'allow', port: '19132', protocol: 'udp', from_ip: '203.0.113.7', label: 'Bedrock friend' });

    await upgradeFromPreviousVersion();

    const row = sqlite.prepare('SELECT protocol, from_ip FROM firewall_rules WHERE label = ?').get('Bedrock friend');
    expect(row).toEqual({ protocol: 'both', from_ip: '203.0.113.7' });
  });

  it('leaves deny rules, other ports and other protocols untouched', async () => {
    insertRule({ action: 'deny', port: '19132', protocol: 'udp', label: 'deny bedrock' });
    insertRule({ action: 'allow', port: '19133', protocol: 'udp', label: 'other port' });
    insertRule({ action: 'allow', port: '24454', protocol: 'udp', label: 'voice chat' });

    await upgradeFromPreviousVersion();

    expect(protocolOf('deny bedrock')).toBe('udp');
    expect(protocolOf('other port')).toBe('udp');
    expect(protocolOf('voice chat')).toBe('udp');
  });

  it('skips a UDP rule that already has a TCP allow for the same source', async () => {
    insertRule({ action: 'allow', port: '19132', protocol: 'udp', label: 'bedrock udp' });
    insertRule({ action: 'allow', port: '19132', protocol: 'tcp', label: 'bedrock tcp' });

    await upgradeFromPreviousVersion();

    expect(protocolOf('bedrock udp')).toBe('udp');
    expect(protocolOf('bedrock tcp')).toBe('tcp');
  });

  it('runs only once, so a UDP-only rule recreated afterwards is kept', async () => {
    insertRule({ action: 'allow', port: '19132', protocol: 'udp', label: 'GeyserMC (Bedrock)' });
    await upgradeFromPreviousVersion();
    sqlite.exec(`DELETE FROM firewall_rules`);
    insertRule({ action: 'allow', port: '19132', protocol: 'udp', label: 'RakNet only' });

    await initializeDatabase(sqlite);

    expect(protocolOf('RakNet only')).toBe('udp');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(1);
  });
});
