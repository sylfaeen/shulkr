import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, desc, lt } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import {
  backupMetadata,
  cloudDestinations,
  servers,
  type BackupStrategy,
  type BackupMetadataRow,
  type CloudDestinationRow,
} from '@shulkr/backend/db/schema';
import { rowToCredentials } from '@shulkr/backend/api/cloud_destinations';
import {
  uploadFile,
  downloadFile,
  deleteObject,
  type CloudDestinationCredentials,
} from '@shulkr/backend/services/cloud_storage_service';
import { BACKUPS_BASE_PATH } from '@shulkr/backend/services/paths';

export type PostBackupResult = {
  cloudUploaded: boolean;
  localRemoved: boolean;
  error?: string;
};

export async function applyPostBackup(
  serverId: string,
  filename: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<PostBackupResult> {
  const strategy = await getServerStrategy(serverId);
  if (strategy.mode === 'local-only') return { cloudUploaded: false, localRemoved: false };
  if (!strategy.cloudDestinationId) return { cloudUploaded: false, localRemoved: false, error: 'no_destination' };

  const [destRow] = await db
    .select()
    .from(cloudDestinations)
    .where(eq(cloudDestinations.id, strategy.cloudDestinationId))
    .limit(1);
  if (!destRow) return { cloudUploaded: false, localRemoved: false, error: 'destination_missing' };
  if (!destRow.enabled) return { cloudUploaded: false, localRemoved: false, error: 'destination_disabled' };

  const localPath = path.join(BACKUPS_BASE_PATH, filename);
  const stat = await fs.stat(localPath);
  const creds = rowToCredentials(destRow);
  const key = `${serverId}/${filename}`;

  const uploaded = await uploadFile(creds, localPath, key, { onProgress });

  await db.insert(backupMetadata).values({
    server_id: serverId,
    filename,
    size: stat.size,
    location: strategy.mode === 'cloud-only' ? 'cloud' : 'hybrid',
    local_path: strategy.mode === 'cloud-only' ? null : localPath,
    cloud_destination_id: destRow.id,
    cloud_key: uploaded.key,
    cloud_checksum: uploaded.checksumMd5,
    cloud_uploaded_at: new Date().toISOString(),
  });

  let localRemoved = false;
  if (strategy.mode === 'cloud-only') {
    await fs.unlink(localPath).catch(() => {});
    localRemoved = true;
  }

  await enforceRotation(serverId, destRow, strategy);

  return { cloudUploaded: true, localRemoved };
}

export async function getServerStrategy(serverId: string): Promise<BackupStrategy> {
  const [row] = await db.select({ backup_strategy: servers.backup_strategy }).from(servers).where(eq(servers.id, serverId)).limit(1);
  return row?.backup_strategy ?? { mode: 'local-only' };
}

export async function setServerStrategy(serverId: string, strategy: BackupStrategy): Promise<void> {
  await db.update(servers).set({ backup_strategy: strategy, updated_at: new Date().toISOString() }).where(eq(servers.id, serverId));
}

async function enforceRotation(serverId: string, destRow: CloudDestinationRow, strategy: BackupStrategy): Promise<void> {
  if (strategy.mode === 'hybrid' && strategy.localRetentionCount && strategy.localRetentionCount > 0) {
    const localBackups = await db
      .select()
      .from(backupMetadata)
      .where(and(eq(backupMetadata.server_id, serverId), eq(backupMetadata.location, 'hybrid')))
      .orderBy(desc(backupMetadata.created_at));
    const excess = localBackups.slice(strategy.localRetentionCount);
    for (const old of excess) {
      if (old.local_path) {
        await fs.unlink(old.local_path).catch(() => {});
      }
      await db
        .update(backupMetadata)
        .set({ location: 'cloud', local_path: null })
        .where(eq(backupMetadata.id, old.id));
    }
  }

  if (strategy.cloudRetentionDays && strategy.cloudRetentionDays > 0) {
    const cutoff = new Date(Date.now() - strategy.cloudRetentionDays * 86_400_000).toISOString();
    const oldCloud = await db
      .select()
      .from(backupMetadata)
      .where(and(eq(backupMetadata.server_id, serverId), lt(backupMetadata.created_at, cutoff)));
    const creds = rowToCredentials(destRow);
    for (const old of oldCloud) {
      if (old.cloud_key) await deleteObject(creds, old.cloud_key).catch(() => {});
      if (old.local_path) await fs.unlink(old.local_path).catch(() => {});
      await db.delete(backupMetadata).where(eq(backupMetadata.id, old.id));
    }
  }
}

export async function downloadFromCloud(
  metadata: BackupMetadataRow,
  destinationLocalPath: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<{ size: number; checksumMd5: string }> {
  if (!metadata.cloud_destination_id || !metadata.cloud_key) {
    throw new Error('Backup has no cloud location');
  }
  const [destRow] = await db
    .select()
    .from(cloudDestinations)
    .where(eq(cloudDestinations.id, metadata.cloud_destination_id))
    .limit(1);
  if (!destRow) throw new Error('Cloud destination no longer exists');

  const creds = rowToCredentials(destRow);
  return downloadFile(creds, metadata.cloud_key, destinationLocalPath, { onProgress });
}

export async function hydrateDestination(id: string): Promise<CloudDestinationCredentials | null> {
  const [row] = await db.select().from(cloudDestinations).where(eq(cloudDestinations.id, id)).limit(1);
  if (!row) return null;
  return rowToCredentials(row);
}
