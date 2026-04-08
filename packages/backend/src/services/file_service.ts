import fs from 'fs/promises';
import path from 'path';
import { existsSync, realpathSync, statSync } from 'fs';
import { ErrorCodes } from '@shulkr/shared';

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  permissions: string;
}

export interface FileServiceResult<T> {
  success: true;
  data: T;
}

export interface FileServiceError {
  success: false;
  error: (typeof ErrorCodes)[keyof typeof ErrorCodes];
}

export type FileServiceResponse<T> = FileServiceResult<T> | FileServiceError;

export class FileService {
  private validatePath(basePath: string, requestedPath: string): string | null {
    const normalizedBase = realpathSync(path.resolve(basePath));
    const fullPath = path.resolve(path.join(normalizedBase, requestedPath));

    if (!fullPath.startsWith(normalizedBase + path.sep) && fullPath !== normalizedBase) {
      return null;
    }

    if (existsSync(fullPath)) {
      const realFullPath = realpathSync(fullPath);
      if (!realFullPath.startsWith(normalizedBase + path.sep) && realFullPath !== normalizedBase) {
        return null;
      }
    }

    return fullPath;
  }

  private getPermissionsString(mode: number): string {
    const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    const owner = perms[(mode >> 6) & 7];
    const group = perms[(mode >> 3) & 7];
    const other = perms[mode & 7];
    return owner + group + other;
  }

  resolveFilePath(
    basePath: string,
    relativePath: string
  ): { success: true; fullPath: string; basename: string; size: number } | { success: false; error: string } {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    const stat = statSync(safePath);
    if (stat.isDirectory()) {
      return { success: false, error: ErrorCodes.FILE_IS_A_DIRECTORY };
    }

    return { success: true, fullPath: safePath, basename: path.basename(safePath), size: stat.size };
  }

  async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            totalSize += await this.calculateDirectorySize(entryPath);
          } else {
            const entryStat = await fs.stat(entryPath);
            totalSize += entryStat.size;
          }
        } catch {
          //
        }
      }
    } catch {
      //
    }
    return totalSize;
  }

  async listDirectory(basePath: string, relativePath: string = '/'): Promise<FileServiceResponse<Array<FileInfo>>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    try {
      const stat = await fs.stat(safePath);

      if (!stat.isDirectory()) {
        return { success: false, error: ErrorCodes.FILE_NOT_A_DIRECTORY };
      }

      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const files: Array<FileInfo> = [];

      for (const entry of entries) {
        try {
          const entryPath = path.join(safePath, entry.name);
          const entryStat = await fs.stat(entryPath);
          const relPath = path.join(relativePath, entry.name);
          const isDir = entry.isDirectory();

          files.push({
            name: entry.name,
            path: relPath.startsWith('/') ? relPath : '/' + relPath,
            type: isDir ? 'directory' : 'file',
            size: isDir ? await this.calculateDirectorySize(entryPath) : entryStat.size,
            modified: entryStat.mtime.toISOString(),
            permissions: this.getPermissionsString(entryStat.mode),
          });
        } catch {
          //
        }
      }

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return { success: true, data: files };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async readFile(basePath: string, relativePath: string): Promise<FileServiceResponse<string>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    try {
      const stat = await fs.stat(safePath);

      if (stat.isDirectory()) {
        return { success: false, error: ErrorCodes.FILE_IS_A_DIRECTORY };
      }

      // Limit file size to 10MB for reading
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        return { success: false, error: ErrorCodes.FILE_TOO_LARGE };
      }

      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, data: content };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async writeFile(basePath: string, relativePath: string, content: string): Promise<FileServiceResponse<{ path: string }>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(safePath);
      await fs.mkdir(parentDir, { recursive: true });

      await fs.writeFile(safePath, content, 'utf-8');
      return { success: true, data: { path: relativePath } };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async deleteFile(basePath: string, relativePath: string): Promise<FileServiceResponse<{ path: string }>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    // Prevent deleting the root directory
    if (safePath === path.resolve(basePath)) {
      return { success: false, error: ErrorCodes.FILE_CANNOT_DELETE_ROOT };
    }

    try {
      const stat = await fs.stat(safePath);

      if (stat.isDirectory()) {
        await fs.rm(safePath, { recursive: true });
      } else {
        await fs.unlink(safePath);
      }

      return { success: true, data: { path: relativePath } };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async createDirectory(basePath: string, relativePath: string): Promise<FileServiceResponse<{ path: string }>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_ALREADY_EXISTS };
    }

    try {
      await fs.mkdir(safePath, { recursive: true });
      return { success: true, data: { path: relativePath } };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async renameFile(
    basePath: string,
    oldPath: string,
    newPath: string
  ): Promise<FileServiceResponse<{ oldPath: string; newPath: string }>> {
    const safeOldPath = this.validatePath(basePath, oldPath);
    const safeNewPath = this.validatePath(basePath, newPath);

    if (!safeOldPath || !safeNewPath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safeOldPath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    if (existsSync(safeNewPath)) {
      return { success: false, error: ErrorCodes.FILE_ALREADY_EXISTS };
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(safeNewPath);
      await fs.mkdir(parentDir, { recursive: true });

      await fs.rename(safeOldPath, safeNewPath);
      return { success: true, data: { oldPath, newPath } };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async uploadFile(
    basePath: string,
    relativePath: string,
    buffer: Buffer
  ): Promise<FileServiceResponse<{ path: string; size: number }>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(safePath);
      await fs.mkdir(parentDir, { recursive: true });

      await fs.writeFile(safePath, buffer);
      return { success: true, data: { path: relativePath, size: buffer.length } };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }

  async getFileInfo(basePath: string, relativePath: string): Promise<FileServiceResponse<FileInfo>> {
    const safePath = this.validatePath(basePath, relativePath);

    if (!safePath) {
      return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
    }

    if (!existsSync(safePath)) {
      return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
    }

    try {
      const stat = await fs.stat(safePath);

      return {
        success: true,
        data: {
          name: path.basename(safePath),
          path: relativePath,
          type: stat.isDirectory() ? 'directory' : 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          permissions: this.getPermissionsString(stat.mode),
        },
      };
    } catch {
      return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
    }
  }
}

export const fileService = new FileService();
