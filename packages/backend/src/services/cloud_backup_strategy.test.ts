import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { backupMetadata, cloudDestinations } from '@shulkr/backend/db/schema';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedServer } from '@shulkr/backend/test/seed';
import { encryptSecret } from '@shulkr/backend/services/encryption_service';
import {
  getServerStrategyWithDeps,
  setServerStrategyWithDeps,
  stageCloudBackupWithDeps,
} from '@shulkr/backend/services/cloud_backup_strategy';

describe('cloud_backup_strategy', () => {
  let deps: TestDeps;
  let serverId: string;
  const stagingDir = join(process.env.BACKUPS_BASE_PATH!, '.cloud-restore');

  beforeAll(() => {
    deps = createTestDeps();
    serverId = seedServer(deps).id;
  });

  afterAll(() => {
    cleanupTestDeps(deps);
    rmSync(stagingDir, { recursive: true, force: true });
  });

  async function seedCloudBackup(filename: string, cloudKey: string) {
    const [dest] = await deps.db
      .insert(cloudDestinations)
      .values({
        name: 'r2',
        provider: 'cloudflare-r2',
        endpoint: 'https://r2.example',
        region: 'auto',
        bucket: 'shulkr-cloud',
        access_key_id: 'AKIA-test',
        secret_access_key_encrypted: encryptSecret('secret'),
        prefix: '',
      })
      .returning();

    const [meta] = await deps.db
      .insert(backupMetadata)
      .values({ server_id: serverId, filename, size: 15, location: 'cloud', cloud_destination_id: dest.id, cloud_key: cloudKey })
      .returning();

    return meta;
  }

  it('getServerStrategyWithDeps defaults to local-only when unset', async () => {
    const strategy = await getServerStrategyWithDeps(deps, serverId);
    expect(strategy).toEqual({ mode: 'local-only' });
  });

  it('setServerStrategyWithDeps + getServerStrategyWithDeps round-trip', async () => {
    await setServerStrategyWithDeps(deps, serverId, { mode: 'hybrid', cloudDestinationId: 'dest-123' });
    const strategy = await getServerStrategyWithDeps(deps, serverId);
    expect(strategy).toEqual({ mode: 'hybrid', cloudDestinationId: 'dest-123' });
  });

  it('stageCloudBackupWithDeps downloads a cloud-only backup under BACKUPS_BASE_PATH/.cloud-restore', async () => {
    // The fake S3 writes to the real disk while deps.fs is in-memory, so the staging dir must exist on disk for the download to land.
    mkdirSync(stagingDir, { recursive: true });
    const filename = 'srv-cloud-manual-2026-01-01T00-00-00.zip';
    const meta = await seedCloudBackup(filename, `${serverId}/${filename}`);
    deps.s3.put('shulkr-cloud', `${serverId}/${filename}`, 'cloud-zip-bytes');

    const localPath = await stageCloudBackupWithDeps(deps, meta);

    expect(localPath).toBe(join(stagingDir, filename));
    expect(await deps.fs.exists(stagingDir)).toBe(true);
    expect(readFileSync(localPath, 'utf8')).toBe('cloud-zip-bytes');
  });

  it('stageCloudBackupWithDeps rethrows a failed download and removes the staged file', async () => {
    const filename = 'srv-cloud-manual-2026-01-02T00-00-00.zip';
    const meta = await seedCloudBackup(filename, `${serverId}/missing.zip`);
    // Simulates the partial file a broken transfer leaves behind.
    deps.fs.put(join(stagingDir, filename), 'partial');

    await expect(stageCloudBackupWithDeps(deps, meta)).rejects.toThrow(/not found/);
    expect(await deps.fs.exists(join(stagingDir, filename))).toBe(false);
  });
});
