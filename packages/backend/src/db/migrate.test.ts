import { describe, it, expect } from 'vitest';
import { createSqlite } from '@shulkr/backend/db';
import { initializeDatabase } from '@shulkr/backend/db/migrate';

// Story 59.7 AC7: data migration of legacy IPv4-mapped IPv6 bans.
describe('initializeDatabase data migrations (story 59.7)', () => {
  it('rewrites global_ip_bans rows stored as ::ffff:<ipv4> to their canonical IPv4 form', async () => {
    const sqlite = createSqlite(':memory:');
    await initializeDatabase(sqlite);

    sqlite.prepare(`INSERT INTO global_ip_bans (ip, banned_by) VALUES ('::ffff:1.2.3.4', 'admin'), ('5.6.7.8', 'admin')`).run();

    await initializeDatabase(sqlite);

    const rows = sqlite.prepare(`SELECT ip FROM global_ip_bans ORDER BY ip`).all() as Array<{ ip: string }>;
    expect(rows.map((r) => r.ip)).toEqual(['1.2.3.4', '5.6.7.8']);
  });

  it('deduplicates when both ::ffff:<ipv4> and <ipv4> coexist (drops the IPv6-mapped row)', async () => {
    const sqlite = createSqlite(':memory:');
    await initializeDatabase(sqlite);

    sqlite.prepare(`INSERT INTO global_ip_bans (ip, banned_by) VALUES ('1.2.3.4', 'admin'), ('::ffff:1.2.3.4', 'admin')`).run();

    await initializeDatabase(sqlite);

    const rows = sqlite.prepare(`SELECT ip FROM global_ip_bans`).all() as Array<{ ip: string }>;
    expect(rows.map((r) => r.ip)).toEqual(['1.2.3.4']);
  });

  it('leaves ::ffff: rows whose suffix is not a valid IPv4 untouched', async () => {
    const sqlite = createSqlite(':memory:');
    await initializeDatabase(sqlite);

    sqlite.prepare(`INSERT INTO global_ip_bans (ip, banned_by) VALUES ('::ffff:notanip', 'admin')`).run();

    await initializeDatabase(sqlite);

    const rows = sqlite.prepare(`SELECT ip FROM global_ip_bans`).all() as Array<{ ip: string }>;
    expect(rows.map((r) => r.ip)).toEqual(['::ffff:notanip']);
  });
});
