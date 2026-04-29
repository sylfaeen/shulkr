import path from 'path';
import archiver from 'archiver';
import { eq } from 'drizzle-orm';
import { backupSnapshots } from '@shulkr/backend/db/schema';
import { BACKUPS_BASE_PATH, SERVERS_BASE_PATH } from '@shulkr/backend/services/paths';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

export interface BackupResult {
  success: boolean;
  filename?: string;
  path?: string;
  size?: number;
  error?: string;
}

export interface BackupProgress {
  percentage: number;
  processedBytes: number;
  totalBytes: number;
}

export type BackupSource = 'manual' | 'auto';

export type BackupType = 'full' | 'incremental';

type FileSnapshot = Record<string, { mtime: number; size: number }>;

export type BackupStatus = 'creating' | 'ready';

export interface PendingBackup {
  filename: string;
  serverId: string;
  startedAt: string;
  progress: number;
}

type Deps = Pick<AppDeps, 'db' | 'fs' | 'clock'>;

function buildBackupFilename(deps: Deps, serverName: string, source: BackupSource, type: BackupType = 'full'): string {
  const timestamp = deps.clock().toISOString().replace(/[:.]/g, '-');
  const slug = serverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = type === 'incremental' ? '-incremental' : '';
  return `${slug}-${source}${suffix}-${timestamp}.zip`;
}

async function getDirectorySize(deps: Deps, dirPath: string): Promise<number> {
  let totalSize = 0;
  const entries = await deps.fs.readdir(dirPath);
  for (const entryName of entries) {
    const itemPath = path.join(dirPath, entryName);
    try {
      const stat = await deps.fs.stat(itemPath);
      if (stat.isDirectory()) {
        totalSize += await getDirectorySize(deps, itemPath);
      } else {
        totalSize += stat.size;
      }
    } catch {}
  }
  return totalSize;
}

async function createZipArchive(
  deps: Deps,
  sourcePath: string,
  destPath: string,
  totalSize: number,
  onProgress?: (progress: BackupProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = deps.fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    let processedBytes = 0;
    output.on('close', resolve);
    archive.on('error', reject);
    archive.on('progress', (progress) => {
      processedBytes = progress.fs.processedBytes;
      if (onProgress && totalSize > 0) {
        onProgress({
          percentage: Math.round((processedBytes / totalSize) * 100),
          processedBytes,
          totalBytes: totalSize,
        });
      }
    });
    archive.pipe(output);
    archive.directory(sourcePath, false);
    archive.finalize();
  });
}

async function createSelectiveZipArchive(
  deps: Deps,
  serverPath: string,
  destPath: string,
  paths: Array<string>,
  totalSize: number,
  onProgress?: (progress: BackupProgress) => void
): Promise<void> {
  const resolvedServerPath = await deps.fs.realpath(path.resolve(serverPath));
  const candidates: Array<{ realPath: string; archivePath: string; isDirectory: boolean }> = [];

  for (const relativePath of paths) {
    const fullPath = path.resolve(path.join(serverPath, relativePath));
    if (!fullPath.startsWith(resolvedServerPath)) continue;
    if (!(await deps.fs.exists(fullPath))) continue;
    const realFullPath = await deps.fs.realpath(fullPath);
    if (!realFullPath.startsWith(resolvedServerPath + path.sep) && realFullPath !== resolvedServerPath) continue;
    const stat = await deps.fs.stat(realFullPath);
    candidates.push({
      realPath: realFullPath,
      archivePath: relativePath.replace(/^\/+/, ''),
      isDirectory: stat.isDirectory(),
    });
  }

  return new Promise((resolve, reject) => {
    const output = deps.fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    let processedBytes = 0;
    output.on('close', resolve);
    archive.on('error', reject);
    archive.on('progress', (progress) => {
      processedBytes = progress.fs.processedBytes;
      if (onProgress && totalSize > 0) {
        onProgress({
          percentage: Math.round((processedBytes / totalSize) * 100),
          processedBytes,
          totalBytes: totalSize,
        });
      }
    });
    archive.pipe(output);
    for (const candidate of candidates) {
      if (candidate.isDirectory) {
        archive.directory(candidate.realPath, candidate.archivePath);
      } else {
        archive.file(candidate.realPath, { name: candidate.archivePath });
      }
    }
    archive.finalize();
  });
}

export async function createFullBackup(
  deps: Deps,
  serverPath: string,
  serverName: string,
  source: BackupSource = 'manual',
  onProgress?: (progress: BackupProgress) => void,
  overrideFilename?: string
): Promise<BackupResult> {
  try {
    if (!(await deps.fs.exists(serverPath))) {
      return { success: false, error: 'Server directory not found' };
    }
    await deps.fs.mkdir(BACKUPS_BASE_PATH, { recursive: true });

    const filename = overrideFilename ?? buildBackupFilename(deps, serverName, source);
    const backupPath = path.join(BACKUPS_BASE_PATH, filename);
    const totalSize = await getDirectorySize(deps, serverPath);
    await createZipArchive(deps, serverPath, backupPath, totalSize, onProgress);

    const stats = await deps.fs.stat(backupPath);
    return {
      success: true,
      filename,
      path: backupPath,
      size: stats.size,
    };
  } catch (error) {
    console.error('Backup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during backup',
    };
  }
}

export async function deleteServerDirectory(deps: Deps, serverPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await deps.fs.exists(serverPath))) {
      return { success: true };
    }
    const realPath = await deps.fs.realpath(serverPath);
    const realBase = await deps.fs.realpath(SERVERS_BASE_PATH);
    if (!realPath.startsWith(realBase + path.sep) && realPath !== realBase) {
      return {
        success: false,
        error: 'Invalid server path - outside allowed directory',
      };
    }
    await deps.fs.rm(serverPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    console.error('Failed to delete server directory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete directory',
    };
  }
}

export async function listServerBackups(
  deps: Deps,
  serverName: string
): Promise<Array<{ name: string; size: number; date: Date }>> {
  try {
    if (!(await deps.fs.exists(BACKUPS_BASE_PATH))) {
      return [];
    }

    const files = await deps.fs.readdir(BACKUPS_BASE_PATH);
    const slug = serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const backups: Array<{ name: string; size: number; date: Date }> = [];
    for (const file of files) {
      if (file.startsWith(slug + '-') && file.endsWith('.zip')) {
        const filePath = path.join(BACKUPS_BASE_PATH, file);
        const stats = await deps.fs.stat(filePath);
        backups.push({
          name: file,
          size: stats.size,
          date: new Date(stats.mtimeMs),
        });
      }
    }
    backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    return backups;
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

export async function renameBackupFile(
  deps: Deps,
  filename: string,
  newFilename: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sanitized = path.basename(filename);
    let sanitizedNew = path.basename(newFilename);
    if (!sanitized.endsWith('.zip') || !sanitizedNew.endsWith('.zip')) {
      return { success: false, error: 'Invalid backup filename' };
    }
    const slugMatch = sanitized.match(/^([a-z0-9-]+?)-(?:manual|auto)/);
    if (slugMatch) {
      const slug = slugMatch[1];
      if (!sanitizedNew.startsWith(slug + '-')) {
        sanitizedNew = `${slug}-${sanitizedNew}`;
      }
    }

    const oldPath = path.join(BACKUPS_BASE_PATH, sanitized);
    const newPath = path.join(BACKUPS_BASE_PATH, sanitizedNew);
    if (!path.normalize(oldPath).startsWith(BACKUPS_BASE_PATH) || !path.normalize(newPath).startsWith(BACKUPS_BASE_PATH)) {
      return { success: false, error: 'Invalid backup path' };
    }
    if (!(await deps.fs.exists(oldPath))) {
      return { success: false, error: 'Backup not found' };
    }
    if (await deps.fs.exists(newPath)) {
      return { success: false, error: 'A backup with this name already exists' };
    }
    await deps.fs.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to rename backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rename backup',
    };
  }
}

export async function deleteBackupFile(deps: Deps, filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.zip')) {
      return { success: false, error: 'Invalid backup filename' };
    }
    const filePath = path.join(BACKUPS_BASE_PATH, sanitized);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(BACKUPS_BASE_PATH)) {
      return { success: false, error: 'Invalid backup path' };
    }
    if (!(await deps.fs.exists(filePath))) {
      return { success: false, error: 'Backup not found' };
    }
    await deps.fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backup',
    };
  }
}

export async function getBackupPath(deps: Deps, filename: string): Promise<string | null> {
  const sanitized = path.basename(filename);
  if (!sanitized.endsWith('.zip')) return null;
  const filePath = path.join(BACKUPS_BASE_PATH, sanitized);
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(BACKUPS_BASE_PATH)) return null;
  if (!(await deps.fs.exists(filePath))) return null;
  return filePath;
}

export async function createSelectiveBackup(
  deps: Deps,
  serverPath: string,
  serverName: string,
  paths: Array<string>,
  source: BackupSource = 'manual',
  onProgress?: (progress: BackupProgress) => void,
  overrideFilename?: string
): Promise<BackupResult> {
  try {
    if (!(await deps.fs.exists(serverPath))) {
      return { success: false, error: 'Server directory not found' };
    }
    await deps.fs.mkdir(BACKUPS_BASE_PATH, { recursive: true });

    const filename = overrideFilename ?? buildBackupFilename(deps, serverName, source);
    const backupPath = path.join(BACKUPS_BASE_PATH, filename);

    const resolvedBase = await deps.fs.realpath(path.resolve(serverPath));
    let totalSize = 0;
    for (const relativePath of paths) {
      const fullPath = path.resolve(path.join(serverPath, relativePath));
      if (!fullPath.startsWith(resolvedBase)) continue;
      if (!(await deps.fs.exists(fullPath))) continue;
      const realPath = await deps.fs.realpath(fullPath);
      if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) continue;
      const stat = await deps.fs.stat(realPath);
      if (stat.isDirectory()) {
        totalSize += await getDirectorySize(deps, realPath);
      } else {
        totalSize += stat.size;
      }
    }

    await createSelectiveZipArchive(deps, serverPath, backupPath, paths, totalSize, onProgress);
    const stats = await deps.fs.stat(backupPath);
    return {
      success: true,
      filename,
      path: backupPath,
      size: stats.size,
    };
  } catch (error) {
    console.error('Selective backup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during backup',
    };
  }
}

export async function buildSnapshot(deps: Deps, dirPath: string, basePath: string = dirPath): Promise<FileSnapshot> {
  const snapshot: FileSnapshot = {};
  const entries = await deps.fs.readdir(dirPath);
  for (const entryName of entries) {
    const fullPath = path.join(dirPath, entryName);
    const relativePath = path.relative(basePath, fullPath);
    try {
      const stat = await deps.fs.stat(fullPath);
      if (stat.isDirectory()) {
        const subSnapshot = await buildSnapshot(deps, fullPath, basePath);
        Object.assign(snapshot, subSnapshot);
      } else {
        snapshot[relativePath] = { mtime: Math.floor(stat.mtimeMs), size: stat.size };
      }
    } catch {}
  }
  return snapshot;
}

export function compareSnapshot(current: FileSnapshot, previous: FileSnapshot): Array<string> {
  const changed: Array<string> = [];
  for (const [filePath, info] of Object.entries(current)) {
    const prev = previous[filePath];
    if (!prev || prev.mtime !== info.mtime || prev.size !== info.size) {
      changed.push(filePath);
    }
  }
  return changed;
}

export async function getServerSnapshot(deps: Deps, serverId: string): Promise<FileSnapshot | null> {
  const [row] = await deps.db.select().from(backupSnapshots).where(eq(backupSnapshots.server_id, serverId)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.snapshot_data) as FileSnapshot;
  } catch {
    return null;
  }
}

export async function saveServerSnapshot(deps: Deps, serverId: string, snapshot: FileSnapshot): Promise<void> {
  const [existing] = await deps.db
    .select({ id: backupSnapshots.id })
    .from(backupSnapshots)
    .where(eq(backupSnapshots.server_id, serverId))
    .limit(1);

  if (existing) {
    await deps.db
      .update(backupSnapshots)
      .set({
        snapshot_data: JSON.stringify(snapshot),
        created_at: deps.clock().toISOString(),
      })
      .where(eq(backupSnapshots.id, existing.id));
  } else {
    await deps.db.insert(backupSnapshots).values({
      server_id: serverId,
      snapshot_data: JSON.stringify(snapshot),
    });
  }
}

export async function createIncrementalBackup(
  deps: Deps,
  serverPath: string,
  serverName: string,
  serverId: string,
  source: BackupSource = 'manual',
  onProgress?: (progress: BackupProgress) => void,
  overrideFilename?: string
): Promise<BackupResult & { type: BackupType }> {
  const previousSnapshot = await getServerSnapshot(deps, serverId);
  const currentSnapshot = await buildSnapshot(deps, serverPath);

  if (!previousSnapshot) {
    const result = await createFullBackup(deps, serverPath, serverName, source, onProgress, overrideFilename);
    if (result.success) {
      await saveServerSnapshot(deps, serverId, currentSnapshot);
    }
    return { ...result, type: 'full' };
  }

  const changedFiles = compareSnapshot(currentSnapshot, previousSnapshot);
  if (changedFiles.length === 0) {
    await saveServerSnapshot(deps, serverId, currentSnapshot);
    return { success: true, type: 'full', filename: undefined, size: 0 };
  }

  try {
    await deps.fs.mkdir(BACKUPS_BASE_PATH, { recursive: true });
    const filename = overrideFilename ?? buildBackupFilename(deps, serverName, source, 'incremental');
    const backupPath = path.join(BACKUPS_BASE_PATH, filename);

    let totalSize = 0;
    for (const relativePath of changedFiles) {
      const fullPath = path.join(serverPath, relativePath);
      if (await deps.fs.exists(fullPath)) {
        const stat = await deps.fs.stat(fullPath);
        totalSize += stat.isDirectory() ? await getDirectorySize(deps, fullPath) : stat.size;
      }
    }

    await createSelectiveZipArchive(deps, serverPath, backupPath, changedFiles, totalSize, onProgress);
    const stats = await deps.fs.stat(backupPath);
    await saveServerSnapshot(deps, serverId, currentSnapshot);
    return {
      success: true,
      type: 'incremental',
      filename,
      path: backupPath,
      size: stats.size,
    };
  } catch (error) {
    console.error('Incremental backup failed:', error);
    return {
      success: false,
      type: 'incremental',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export class BackupService {
  private pendingBackups = new Map<string, PendingBackup>();

  getPendingBackups(serverSlug: string): Array<PendingBackup> {
    return Array.from(this.pendingBackups.values()).filter((b) => b.filename.startsWith(serverSlug + '-'));
  }

  addPending(filename: string, serverId: string): void {
    this.pendingBackups.set(filename, {
      filename,
      serverId,
      startedAt: getAppDeps().clock().toISOString(),
      progress: 0,
    });
  }

  updateProgress(filename: string, progress: number): void {
    const pending = this.pendingBackups.get(filename);
    if (pending) {
      pending.progress = progress;
    }
  }

  removePending(filename: string): void {
    this.pendingBackups.delete(filename);
  }

  async createFullBackup(
    serverPath: string,
    serverName: string,
    source: BackupSource = 'manual',
    onProgress?: (progress: BackupProgress) => void,
    overrideFilename?: string
  ): Promise<BackupResult> {
    return createFullBackup(getAppDeps(), serverPath, serverName, source, onProgress, overrideFilename);
  }

  async deleteServerDirectory(serverPath: string) {
    return deleteServerDirectory(getAppDeps(), serverPath);
  }

  async listBackups(serverName: string) {
    return listServerBackups(getAppDeps(), serverName);
  }

  async renameBackup(filename: string, newFilename: string) {
    return renameBackupFile(getAppDeps(), filename, newFilename);
  }

  async deleteBackup(filename: string) {
    return deleteBackupFile(getAppDeps(), filename);
  }

  getBackupPath(filename: string): Promise<string | null> {
    return getBackupPath(getAppDeps(), filename);
  }

  async createSelectiveBackup(
    serverPath: string,
    serverName: string,
    paths: Array<string>,
    source: BackupSource = 'manual',
    onProgress?: (progress: BackupProgress) => void,
    overrideFilename?: string
  ): Promise<BackupResult> {
    return createSelectiveBackup(getAppDeps(), serverPath, serverName, paths, source, onProgress, overrideFilename);
  }

  async buildSnapshot(dirPath: string, basePath: string = dirPath) {
    return buildSnapshot(getAppDeps(), dirPath, basePath);
  }

  compareSnapshot(current: FileSnapshot, previous: FileSnapshot) {
    return compareSnapshot(current, previous);
  }

  async getSnapshot(serverId: string) {
    return getServerSnapshot(getAppDeps(), serverId);
  }

  async saveSnapshot(serverId: string, snapshot: FileSnapshot) {
    return saveServerSnapshot(getAppDeps(), serverId, snapshot);
  }

  async createIncrementalBackup(
    serverPath: string,
    serverName: string,
    serverId: string,
    source: BackupSource = 'manual',
    onProgress?: (progress: BackupProgress) => void,
    overrideFilename?: string
  ) {
    return createIncrementalBackup(getAppDeps(), serverPath, serverName, serverId, source, onProgress, overrideFilename);
  }
}

export const backupService = new BackupService();
