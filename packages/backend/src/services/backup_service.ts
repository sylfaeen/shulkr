import fs from 'fs/promises';
import { createWriteStream, existsSync, realpathSync, statSync } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { BACKUPS_BASE_PATH, SERVERS_BASE_PATH } from '@shulkr/backend/services/paths';

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

function buildBackupFilename(serverName: string, source: BackupSource): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = serverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${source}-${timestamp}.zip`;
}

export type BackupStatus = 'creating' | 'ready';

interface PendingBackup {
  filename: string;
  serverId: string;
  startedAt: string;
}

export class BackupService {
  private pendingBackups = new Map<string, PendingBackup>();

  getPendingBackups(serverSlug: string): Array<PendingBackup> {
    return Array.from(this.pendingBackups.values()).filter((b) => b.filename.startsWith(serverSlug + '-'));
  }

  addPending(filename: string, serverId: string): void {
    this.pendingBackups.set(filename, { filename, serverId, startedAt: new Date().toISOString() });
  }

  removePending(filename: string): void {
    this.pendingBackups.delete(filename);
  }
  /**
   * Create a full backup of a server directory
   * @param serverPath - Path to the server directory
   * @param serverName - Name of the server (for backup filename)
   * @param onProgress - Optional progress callback
   */
  async createFullBackup(
    serverPath: string,
    serverName: string,
    source: BackupSource = 'manual',
    onProgress?: (progress: BackupProgress) => void
  ): Promise<BackupResult> {
    try {
      if (!existsSync(serverPath)) {
        return {
          success: false,
          error: 'Server directory not found',
        };
      }

      // Ensure backups directory exists
      await fs.mkdir(BACKUPS_BASE_PATH, { recursive: true });

      const filename = buildBackupFilename(serverName, source);
      const backupPath = path.join(BACKUPS_BASE_PATH, filename);

      const totalSize = await this.getDirectorySize(serverPath);

      await this.createZipArchive(serverPath, backupPath, totalSize, onProgress);

      // Get final file size
      const stats = await fs.stat(backupPath);

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

  async deleteServerDirectory(serverPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!existsSync(serverPath)) {
        return { success: true };
      }

      // Safety check: resolve symlinks and ensure the real path is within SERVERS_BASE_PATH
      const realPath = realpathSync(serverPath);
      const realBase = realpathSync(SERVERS_BASE_PATH);
      if (!realPath.startsWith(realBase + path.sep) && realPath !== realBase) {
        return {
          success: false,
          error: 'Invalid server path - outside allowed directory',
        };
      }

      await fs.rm(serverPath, { recursive: true, force: true });

      return { success: true };
    } catch (error) {
      console.error('Failed to delete server directory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete directory',
      };
    }
  }

  async listBackups(serverName: string): Promise<Array<{ name: string; size: number; date: Date }>> {
    try {
      if (!existsSync(BACKUPS_BASE_PATH)) {
        return [];
      }

      const files = await fs.readdir(BACKUPS_BASE_PATH);
      const slug = serverName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const backups: Array<{ name: string; size: number; date: Date }> = [];

      for (const file of files) {
        if (file.startsWith(slug + '-') && file.endsWith('.zip')) {
          const filePath = path.join(BACKUPS_BASE_PATH, file);
          const stats = await fs.stat(filePath);
          backups.push({
            name: file,
            size: stats.size,
            date: stats.mtime,
          });
        }
      }

      // Sort by date descending (newest first)
      backups.sort((a, b) => b.date.getTime() - a.date.getTime());

      return backups;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  async deleteBackup(filename: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Safety: only allow .zip files within BACKUPS_BASE_PATH
      const sanitized = path.basename(filename);
      if (!sanitized.endsWith('.zip')) {
        return { success: false, error: 'Invalid backup filename' };
      }

      const filePath = path.join(BACKUPS_BASE_PATH, sanitized);
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(BACKUPS_BASE_PATH)) {
        return { success: false, error: 'Invalid backup path' };
      }

      if (!existsSync(filePath)) {
        return { success: false, error: 'Backup not found' };
      }

      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete backup',
      };
    }
  }

  getBackupPath(filename: string): string | null {
    const sanitized = path.basename(filename);
    if (!sanitized.endsWith('.zip')) return null;

    const filePath = path.join(BACKUPS_BASE_PATH, sanitized);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(BACKUPS_BASE_PATH)) return null;
    if (!existsSync(filePath)) return null;

    return filePath;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        totalSize += await this.getDirectorySize(itemPath);
      } else {
        const stats = await fs.stat(itemPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  /**
   * Create a selective backup of specific files/folders in a server directory
   * @param serverPath - Path to the server directory
   * @param serverName - Name of the server (for backup filename)
   * @param paths - Array of relative paths to include in the backup
   * @param source
   * @param onProgress - Optional progress callback
   */
  async createSelectiveBackup(
    serverPath: string,
    serverName: string,
    paths: Array<string>,
    source: BackupSource = 'manual',
    onProgress?: (progress: BackupProgress) => void
  ): Promise<BackupResult> {
    try {
      if (!existsSync(serverPath)) {
        return { success: false, error: 'Server directory not found' };
      }

      await fs.mkdir(BACKUPS_BASE_PATH, { recursive: true });

      const filename = buildBackupFilename(serverName, source);
      const backupPath = path.join(BACKUPS_BASE_PATH, filename);

      // Calculate total size for selected paths
      const resolvedBase = realpathSync(path.resolve(serverPath));
      let totalSize = 0;
      for (const relativePath of paths) {
        const fullPath = path.resolve(path.join(serverPath, relativePath));

        // Safety: ensure within server directory
        if (!fullPath.startsWith(resolvedBase)) continue;
        if (!existsSync(fullPath)) continue;

        const realPath = realpathSync(fullPath);
        if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) continue;

        const stat = await fs.stat(realPath);
        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(realPath);
        } else {
          totalSize += stat.size;
        }
      }

      await this.createSelectiveZipArchive(serverPath, backupPath, paths, totalSize, onProgress);

      const stats = await fs.stat(backupPath);

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

  private async createZipArchive(
    sourcePath: string,
    destPath: string,
    totalSize: number,
    onProgress?: (progress: BackupProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
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

  private async createSelectiveZipArchive(
    serverPath: string,
    destPath: string,
    paths: Array<string>,
    totalSize: number,
    onProgress?: (progress: BackupProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
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

      const resolvedServerPath = realpathSync(path.resolve(serverPath));

      for (const relativePath of paths) {
        const fullPath = path.resolve(path.join(serverPath, relativePath));

        if (!fullPath.startsWith(resolvedServerPath)) continue;
        if (!existsSync(fullPath)) continue;

        const realFullPath = realpathSync(fullPath);
        if (!realFullPath.startsWith(resolvedServerPath + path.sep) && realFullPath !== resolvedServerPath) continue;

        const stat = statSync(realFullPath);
        const archivePath = relativePath.replace(/^\/+/, '');

        if (stat.isDirectory()) {
          archive.directory(realFullPath, archivePath);
        } else {
          archive.file(realFullPath, { name: archivePath });
        }
      }

      archive.finalize();
    });
  }
}

export const backupService = new BackupService();
