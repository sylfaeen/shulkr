import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { backupShareLinks } from '@shulkr/backend/db/schema';
import { createTestDeps, resetTestDb, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedUser } from '@shulkr/backend/test/seed';
import {
  createShareLink,
  resolveActiveShareLink,
  revokeShareLink,
  listShareLinks,
  recordDownload,
  deleteShareLinksForFilename,
} from '@shulkr/backend/services/backup_share_service';

const BACKUPS_BASE = process.env.BACKUPS_BASE_PATH!;

describe('backup_share_service', () => {
  let deps: TestDeps;
  const filename = 'srv-share-manual-2026-01-01.zip';

  beforeEach(() => {
    resetTestDb();
    deps = createTestDeps({ now: '2026-01-01T00:00:00Z' });
    deps.fs.reset();
    deps.fs.put(path.join(BACKUPS_BASE, filename), 'zip-bytes');
  });

  it('round-trip: a created link resolves back to its backup filename', async () => {
    const { token } = await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });

    const resolved = await resolveActiveShareLink(deps, token);

    expect(resolved).not.toBeNull();
    expect(resolved?.filename).toBe(filename);
  });

  it('stores the token hashed for lookup and encrypted for re-display, never in clear', async () => {
    const { token } = await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });

    const [row] = await deps.db.select().from(backupShareLinks).where(eq(backupShareLinks.filename, filename));

    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toHaveLength(64);
    expect(row.token_encrypted).not.toBe(token);

    const [view] = await listShareLinks(deps, filename);
    expect(view.token).toBe(token);
  });

  it('an unknown token resolves to null', async () => {
    await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });

    expect(await resolveActiveShareLink(deps, 'not-a-real-token')).toBeNull();
  });

  it('a link without expiration never expires and resolves active', async () => {
    const { token, expiresAt } = await createShareLink(deps, { filename, expiresInHours: null, createdBy: 1 });

    expect(expiresAt).toBeNull();

    const farFutureDeps: TestDeps = { ...deps, clock: () => new Date('2099-01-01T00:00:00Z') };

    expect(await resolveActiveShareLink(farFutureDeps, token)).not.toBeNull();
  });

  it('an expired link resolves to null', async () => {
    const { token } = await createShareLink(deps, { filename, expiresInHours: 1, createdBy: 1 });

    const laterDeps: TestDeps = { ...deps, clock: () => new Date('2026-01-01T02:00:00Z') };

    expect(await resolveActiveShareLink(laterDeps, token)).toBeNull();
  });

  it('a revoked link resolves to null', async () => {
    const { token } = await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });
    const [row] = await listShareLinks(deps, filename);

    const revoked = await revokeShareLink(deps, row.id);

    expect(revoked).toBe(true);
    expect(await resolveActiveShareLink(deps, token)).toBeNull();
  });

  it('lists the creator username via the join', async () => {
    const user = await seedUser(deps, { username: 'sharer' });
    await createShareLink(deps, { filename, expiresInHours: 24, createdBy: user.id });

    const [view] = await listShareLinks(deps, filename);

    expect(view.createdByUsername).toBe('sharer');
  });

  it('refuses to share a backup that is not present locally', async () => {
    await expect(
      createShareLink(deps, { filename: 'srv-share-manual-missing.zip', expiresInHours: 24, createdBy: 1 })
    ).rejects.toThrow(ErrorCodes.BACKUP_SHARE_NOT_LOCAL);
  });

  it('recordDownload increments the counter and stores the IP', async () => {
    await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });
    const [view] = await listShareLinks(deps, filename);

    await recordDownload(deps, view.id, '203.0.113.7');

    const [updated] = await listShareLinks(deps, filename);
    expect(updated.downloadCount).toBe(1);

    const [row] = await deps.db.select().from(backupShareLinks).where(eq(backupShareLinks.id, view.id));
    expect(row.last_downloaded_ip).toBe('203.0.113.7');
  });

  it('deleteShareLinksForFilename removes orphan links when a backup is deleted', async () => {
    await createShareLink(deps, { filename, expiresInHours: 24, createdBy: 1 });

    await deleteShareLinksForFilename(deps, filename);

    expect(await listShareLinks(deps, filename)).toHaveLength(0);
  });
});
