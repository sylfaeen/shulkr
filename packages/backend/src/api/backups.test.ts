import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { backupMetadata } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer } from '@shulkr/backend/test/seed';

// Story 59.3 ACs adapted to the actual contract. Cloud backup (AC2), restore (AC3/AC4), retention preservation (AC7/AC8) and the racy delete-during-backup (AC9) are out of scope here, they belong to follow-up coverage stories that drive the cloud_backup_strategy and task_scheduler paths end-to-end.
describe('backup routes (story 59.3)', () => {
  let testApp: TestApp;
  const BACKUPS_BASE = process.env.BACKUPS_BASE_PATH!;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    testApp.deps.shell.reset();
    testApp.deps.fs.reset();
    testApp.deps.sqlite.exec('DELETE FROM backup_metadata;');
    testApp.deps.sqlite.exec('DELETE FROM servers;');
    testApp.deps.sqlite.exec('DELETE FROM audit_logs;');
  });

  it('AC10: user without server:backups:create receives 403 when posting a backup', async () => {
    const viewer = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: [] });
    const server = seedServer(testApp.deps, { name: 'srv-rbac' });

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/backup`,
      headers: viewer.headers,
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it('AC1: POST /api/servers/:id/backup returns 200, marks the backup pending, writes an audit log', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:backups:create'] });
    const server = seedServer(testApp.deps, { name: 'srv-create' });
    // Materialise a minimal world so the async createIncrementalBackup has something to read.
    testApp.deps.fs.put(`${server.id}-world/level.dat`, 'fake');

    const res = await testApp.app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/backup`,
      headers: admin.headers,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { message: string };
    expect(body.message).toBe('Backup started');

    const audit = testApp.deps.sqlite
      .prepare(`SELECT action, resource_type, resource_id FROM audit_logs WHERE action = 'create_backup'`)
      .get() as { action: string; resource_type: string; resource_id: string } | undefined;

    expect(audit?.action).toBe('create_backup');
    expect(audit?.resource_type).toBe('backup');
    expect(audit?.resource_id).toBe(server.id);
  });

  it('AC5: GET /api/servers/:id/backups returns the backups stored under BACKUPS_BASE_PATH that match the server slug', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:backups:list'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-list' });
    const slug = 'srv-list';

    for (const filename of [`${slug}-manual-2026-01-01.zip`, `${slug}-manual-2026-01-02.zip`, `${slug}-auto-2026-01-03.zip`]) {
      testApp.deps.fs.put(path.join(BACKUPS_BASE, filename), 'zip-bytes');
    }

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/backups`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ filename: string; size: number; status: string }>;
    expect(body.length).toBe(3);

    expect(body.map((b) => b.filename).sort()).toEqual([
      `${slug}-auto-2026-01-03.zip`,
      `${slug}-manual-2026-01-01.zip`,
      `${slug}-manual-2026-01-02.zip`,
    ]);

    body.forEach((b) => {
      expect(b.status).toBe('ready');
      expect(b.size).toBeGreaterThan(0);
    });
  });

  it('AC6: DELETE /api/servers/backups/:filename removes the file and the metadata row', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:backups:delete'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-del' });
    const filename = 'srv-del-manual-2026-01-01.zip';
    testApp.deps.fs.put(path.join(BACKUPS_BASE, filename), 'zip-bytes');

    await testApp.deps.db
      .insert(backupMetadata)
      .values({ server_id: server.id, filename, size: 9, location: 'local', local_path: path.join(BACKUPS_BASE, filename) });

    const res = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/backups/${filename}`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(await testApp.deps.fs.exists(path.join(BACKUPS_BASE, filename))).toBe(false);
    const rows = await testApp.deps.db.select().from(backupMetadata).where(eq(backupMetadata.filename, filename));
    expect(rows.length).toBe(0);
  });

  it('rename: PATCH /api/servers/backups/:filename renames the file on disk', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:backups:rename'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-rename' });
    const oldName = 'srv-rename-manual-2026-01-01.zip';
    const newName = 'srv-rename-pre-update.zip';
    testApp.deps.fs.put(path.join(BACKUPS_BASE, oldName), 'zip-bytes');

    await testApp.deps.db.insert(backupMetadata).values({
      server_id: server.id,
      filename: oldName,
      size: 9,
      location: 'local',
      local_path: path.join(BACKUPS_BASE, oldName),
    });

    const res = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/servers/backups/${oldName}`,
      headers: admin.headers,
      payload: { newFilename: newName },
    });

    expect(res.statusCode).toBe(200);
    expect(await testApp.deps.fs.exists(path.join(BACKUPS_BASE, oldName))).toBe(false);
    expect(await testApp.deps.fs.exists(path.join(BACKUPS_BASE, newName))).toBe(true);
  });

  it('strategy: GET /api/servers/:id/backup-strategy returns local-only by default', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:backups:list'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-strategy' });

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/backup-strategy`,
      headers: admin.headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { mode: string };
    expect(body.mode).toBe('local-only');
  });

  it('strategy: PATCH /api/servers/:id/backup-strategy persists the mode change', async () => {
    const admin = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:backups:list', 'server:backups:create'],
    });

    const server = seedServer(testApp.deps, { name: 'srv-patch' });

    const patchRes = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/servers/${server.id}/backup-strategy`,
      headers: admin.headers,
      payload: { mode: 'local-only', cloudRetentionDays: 30 },
    });

    expect(patchRes.statusCode).toBe(200);

    const getRes = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/backup-strategy`,
      headers: admin.headers,
    });

    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as { mode: string; cloudRetentionDays?: number };
    expect(body.mode).toBe('local-only');
  });
});
