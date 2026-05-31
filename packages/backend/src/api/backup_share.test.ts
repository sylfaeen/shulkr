import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { backupShareLinks } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer } from '@shulkr/backend/test/seed';

describe('backup share links', () => {
  let testApp: TestApp;
  const BACKUPS_BASE = process.env.BACKUPS_BASE_PATH!;
  const filename = 'srv-share-manual-2026-01-01.zip';

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    testApp.deps.fs.reset();
    testApp.deps.sqlite.exec('DELETE FROM backup_share_links;');
    testApp.deps.sqlite.exec('DELETE FROM servers;');
    testApp.deps.sqlite.exec('DELETE FROM audit_logs;');
    testApp.deps.fs.put(path.join(BACKUPS_BASE, filename), 'zip-bytes');
  });

  async function createLink(headers: Record<string, string>, expiresInHours: number | null = 24) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/servers/backups/${filename}/share`,
      headers,
      payload: { expiresInHours },
    });
  }

  it('rejects link creation without server:backups:share (403)', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:list'] });
    seedServer(testApp.deps, { name: 'srv-share' });

    const res = await createLink(viewer.headers);

    expect(res.statusCode).toBe(403);
  });

  it('creates a /share link and serves the file on the public route without auth', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:share'] });
    seedServer(testApp.deps, { name: 'srv-share' });

    const res = await createLink(admin.headers);

    expect(res.statusCode).toBe(201);
    const body = res.json() as { url: string; expiresAt: string | null };
    expect(body.url).toMatch(/^\/share\/.+/);

    const pub = await testApp.app.inject({ method: 'GET', url: body.url });

    expect(pub.statusCode).toBe(200);
    expect(pub.headers['content-type']).toBe('application/zip');
    expect(pub.body).toBe('zip-bytes');
  });

  it('creates a non-expiring link when expiresInHours is null', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:share'] });
    seedServer(testApp.deps, { name: 'srv-share' });

    const res = await createLink(admin.headers, null);

    expect(res.statusCode).toBe(201);
    const body = res.json() as { url: string; expiresAt: string | null };
    expect(body.expiresAt).toBeNull();

    const pub = await testApp.app.inject({ method: 'GET', url: body.url });
    expect(pub.statusCode).toBe(200);
  });

  it('lists existing links with full url and creator', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      username: 'sharer-admin',
      permissions: ['server:backups:share'],
    });

    seedServer(testApp.deps, { name: 'srv-share' });

    await createLink(admin.headers);

    const list = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/backups/${filename}/share`,
      headers: admin.headers,
    });

    expect(list.statusCode).toBe(200);
    const links = list.json() as Array<{ url: string; createdByUsername: string | null; downloadCount: number }>;
    expect(links).toHaveLength(1);
    expect(links[0].url).toMatch(/^\/share\/.+/);
    expect(links[0].createdByUsername).toBe('sharer-admin');
  });

  it('returns 404 for a bogus token', async () => {
    const pub = await testApp.app.inject({ method: 'GET', url: '/share/does-not-exist' });

    expect(pub.statusCode).toBe(404);
  });

  it('returns 404 after the link is revoked', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:share'] });
    seedServer(testApp.deps, { name: 'srv-share' });

    const created = await createLink(admin.headers);
    const { url } = created.json() as { url: string };

    const [row] = await testApp.deps.db.select().from(backupShareLinks);

    const revoke = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/backups/share/${row.id}`,
      headers: admin.headers,
    });

    expect(revoke.statusCode).toBe(200);

    const pub = await testApp.app.inject({ method: 'GET', url });
    expect(pub.statusCode).toBe(404);
  });

  it('returns 404 for an expired link', async () => {
    // The test clock is frozen, so insert a link whose expiry is already in the past. token_encrypted is never read here (resolve returns null on expiry before decrypting), so any non-null value satisfies the constraint.
    const token = 'expired-token-value';
    const token_hash = createHash('sha256').update(token).digest('hex');

    await testApp.deps.db.insert(backupShareLinks).values({
      filename,
      token_hash,
      token_encrypted: 'unused-in-this-test',
      created_at: '2025-12-01T00:00:00Z',
      expires_at: '2025-12-02T00:00:00Z',
    });

    const pub = await testApp.app.inject({ method: 'GET', url: `/share/${token}` });

    expect(pub.statusCode).toBe(404);
  });

  it('records a public download (count + audit log)', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:share'] });
    seedServer(testApp.deps, { name: 'srv-share' });

    const created = await createLink(admin.headers);
    const { url } = created.json() as { url: string };

    await testApp.app.inject({ method: 'GET', url });

    const row = testApp.deps.sqlite.prepare('SELECT download_count FROM backup_share_links LIMIT 1').get() as {
      download_count: number;
    };

    expect(row.download_count).toBe(1);

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action FROM audit_logs WHERE action = 'public_download_backup'`)
      .get() as { action: string } | undefined;

    expect(audit?.action).toBe('public_download_backup');
  });
});
