import { join } from 'node:path';
import { and, eq, desc, lt } from 'drizzle-orm';
import {
  backupMetadata,
  cloudDestinations,
  servers,
  type BackupStrategy,
  type BackupMetadataRow,
  type CloudDestinationRow,
} from '@shulkr/backend/db/schema';
import { rowToCredentials } from '@shulkr/backend/api/cloud_destinations';
import { BACKUPS_BASE_PATH } from '@shulkr/backend/services/paths';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';
import type { CloudDestinationCredentials } from '@shulkr/backend/deps/s3_adapter';

export type PostBackupResult = {
  cloudUploaded: boolean;
  localRemoved: boolean;
  error?: string;
};

export type UploadExistingBackupResult =
  | { success: true; size: number; checksumMd5: string }
  | {
      success: false;
      error: 'backup_not_found' | 'already_in_cloud' | 'destination_not_found' | 'destination_disabled' | 'upload_failed';
      message?: string;
    };

type Deps = Pick<AppDeps, 'db' | 'fs' | 's3' | 'clock'>;

async function enforceRotation(
  deps: Deps,
  serverId: string,
  destRow: CloudDestinationRow,
  strategy: BackupStrategy,
  maxLocalBackups: number
): Promise<void> {
  if (strategy.mode === 'hybrid' && maxLocalBackups > 0) {
    const localBackups = await deps.db
      .select()
      .from(backupMetadata)
      .where(and(eq(backupMetadata.server_id, serverId), eq(backupMetadata.location, 'hybrid')))
      .orderBy(desc(backupMetadata.created_at));

    const excess = localBackups.slice(maxLocalBackups);
    for (const old of excess) {
      if (old.local_path) {
        await deps.fs.unlink(old.local_path).catch(() => {});
      }
      await deps.db.update(backupMetadata).set({ location: 'cloud', local_path: null }).where(eq(backupMetadata.id, old.id));
    }
  }

  if (strategy.cloudRetentionDays && strategy.cloudRetentionDays > 0) {
    const cutoff = new Date(deps.clock().getTime() - strategy.cloudRetentionDays * 86_400_000).toISOString();
    const oldCloud = await deps.db
      .select()
      .from(backupMetadata)
      .where(and(eq(backupMetadata.server_id, serverId), lt(backupMetadata.created_at, cutoff)));

    const creds = rowToCredentials(destRow);
    for (const old of oldCloud) {
      if (old.cloud_key) await deps.s3.deleteObject(creds, old.cloud_key).catch(() => {});
      if (old.local_path) await deps.fs.unlink(old.local_path).catch(() => {});
      await deps.db.delete(backupMetadata).where(eq(backupMetadata.id, old.id));
    }
  }
}

export async function getServerStrategyWithDeps(deps: Pick<AppDeps, 'db'>, serverId: string): Promise<BackupStrategy> {
  const [row] = await deps.db
    .select({ backup_strategy: servers.backup_strategy })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  return row?.backup_strategy ?? { mode: 'local-only' };
}

export async function setServerStrategyWithDeps(
  deps: Pick<AppDeps, 'db' | 'clock'>,
  serverId: string,
  strategy: BackupStrategy
): Promise<void> {
  await deps.db
    .update(servers)
    .set({ backup_strategy: strategy, updated_at: deps.clock().toISOString() })
    .where(eq(servers.id, serverId));
}

export async function applyPostBackupWithDeps(
  deps: Deps,
  serverId: string,
  filename: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<PostBackupResult> {
  const strategy = await getServerStrategyWithDeps(deps, serverId);
  if (strategy.mode === 'local-only') return { cloudUploaded: false, localRemoved: false };
  if (!strategy.cloudDestinationId) return { cloudUploaded: false, localRemoved: false, error: 'no_destination' };

  const [destRow] = await deps.db
    .select()
    .from(cloudDestinations)
    .where(eq(cloudDestinations.id, strategy.cloudDestinationId))
    .limit(1);
  if (!destRow) return { cloudUploaded: false, localRemoved: false, error: 'destination_missing' };
  if (!destRow.enabled) return { cloudUploaded: false, localRemoved: false, error: 'destination_disabled' };

  const localPath = join(BACKUPS_BASE_PATH, filename);
  const stat = await deps.fs.stat(localPath);
  const creds = rowToCredentials(destRow);
  const key = `${serverId}/${filename}`;
  const uploaded = await deps.s3.uploadFile(creds, localPath, key, { onProgress });

  await deps.db.insert(backupMetadata).values({
    server_id: serverId,
    filename,
    size: stat.size,
    location: strategy.mode === 'cloud-only' ? 'cloud' : 'hybrid',
    local_path: strategy.mode === 'cloud-only' ? null : localPath,
    cloud_destination_id: destRow.id,
    cloud_key: uploaded.key,
    cloud_checksum: uploaded.checksumMd5,
    cloud_uploaded_at: deps.clock().toISOString(),
  });

  let localRemoved = false;
  if (strategy.mode === 'cloud-only') {
    await deps.fs.unlink(localPath).catch(() => {});
    localRemoved = true;
  }

  const [serverRow] = await deps.db
    .select({ max_backups: servers.max_backups })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);
  await enforceRotation(deps, serverId, destRow, strategy, serverRow?.max_backups ?? 0);
  return { cloudUploaded: true, localRemoved };
}

export async function uploadExistingBackupWithDeps(
  deps: Deps,
  serverId: string,
  filename: string,
  cloudDestinationId: string
): Promise<UploadExistingBackupResult> {
  const localPath = join(BACKUPS_BASE_PATH, filename);
  const stat = await deps.fs.stat(localPath).catch(() => null);
  if (!stat) return { success: false, error: 'backup_not_found' };

  const [destRow] = await deps.db.select().from(cloudDestinations).where(eq(cloudDestinations.id, cloudDestinationId)).limit(1);
  if (!destRow) return { success: false, error: 'destination_not_found' };
  if (!destRow.enabled) return { success: false, error: 'destination_disabled' };

  const [existing] = await deps.db
    .select()
    .from(backupMetadata)
    .where(and(eq(backupMetadata.server_id, serverId), eq(backupMetadata.filename, filename)))
    .limit(1);
  if (existing && (existing.location === 'hybrid' || existing.location === 'cloud') && existing.cloud_key) {
    return { success: false, error: 'already_in_cloud' };
  }

  const creds = rowToCredentials(destRow);
  const key = `${serverId}/${filename}`;
  let uploaded: { key: string; size: number; checksumMd5: string };
  try {
    uploaded = await deps.s3.uploadFile(creds, localPath, key);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return { success: false, error: 'upload_failed', message };
  }

  const uploadedAt = deps.clock().toISOString();
  if (existing) {
    await deps.db
      .update(backupMetadata)
      .set({
        location: 'hybrid',
        local_path: localPath,
        cloud_destination_id: destRow.id,
        cloud_key: uploaded.key,
        cloud_checksum: uploaded.checksumMd5,
        cloud_uploaded_at: uploadedAt,
      })
      .where(eq(backupMetadata.id, existing.id));
  } else {
    await deps.db.insert(backupMetadata).values({
      server_id: serverId,
      filename,
      size: stat.size,
      location: 'hybrid',
      local_path: localPath,
      cloud_destination_id: destRow.id,
      cloud_key: uploaded.key,
      cloud_checksum: uploaded.checksumMd5,
      cloud_uploaded_at: uploadedAt,
    });
  }
  return { success: true, size: uploaded.size, checksumMd5: uploaded.checksumMd5 };
}

export async function downloadFromCloudWithDeps(
  deps: Deps,
  metadata: BackupMetadataRow,
  destinationLocalPath: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<{ size: number; checksumMd5: string }> {
  if (!metadata.cloud_destination_id || !metadata.cloud_key) {
    throw new Error('Backup has no cloud location');
  }

  const [destRow] = await deps.db
    .select()
    .from(cloudDestinations)
    .where(eq(cloudDestinations.id, metadata.cloud_destination_id))
    .limit(1);
  if (!destRow) throw new Error('Cloud destination no longer exists');

  const creds = rowToCredentials(destRow);
  return deps.s3.downloadFile(creds, metadata.cloud_key, destinationLocalPath, { onProgress });
}

export async function hydrateDestinationWithDeps(
  deps: Pick<AppDeps, 'db'>,
  id: string
): Promise<CloudDestinationCredentials | null> {
  const [row] = await deps.db.select().from(cloudDestinations).where(eq(cloudDestinations.id, id)).limit(1);
  if (!row) return null;
  return rowToCredentials(row);
}

export function applyPostBackup(
  serverId: string,
  filename: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<PostBackupResult> {
  return applyPostBackupWithDeps(getAppDeps(), serverId, filename, onProgress);
}

export function uploadExistingBackup(
  serverId: string,
  filename: string,
  cloudDestinationId: string
): Promise<UploadExistingBackupResult> {
  return uploadExistingBackupWithDeps(getAppDeps(), serverId, filename, cloudDestinationId);
}

export function downloadFromCloud(
  metadata: BackupMetadataRow,
  destinationLocalPath: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<{ size: number; checksumMd5: string }> {
  return downloadFromCloudWithDeps(getAppDeps(), metadata, destinationLocalPath, onProgress);
}

export function hydrateDestination(id: string): Promise<CloudDestinationCredentials | null> {
  return hydrateDestinationWithDeps(getAppDeps(), id);
}

export function getServerStrategy(serverId: string): Promise<BackupStrategy> {
  return getServerStrategyWithDeps(getAppDeps(), serverId);
}

export function setServerStrategy(serverId: string, strategy: BackupStrategy): Promise<void> {
  return setServerStrategyWithDeps(getAppDeps(), serverId, strategy);
}
