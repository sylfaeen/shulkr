import path from 'path';
import { ErrorCodes } from '@shulkr/shared';
import { type AppDeps } from '@shulkr/backend/deps';

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

type Deps = Pick<AppDeps, 'fs'>;

async function validatePath(deps: Deps, basePath: string, requestedPath: string): Promise<string | null> {
  const normalizedBase = await deps.fs.realpath(path.resolve(basePath));
  const fullPath = path.resolve(path.join(normalizedBase, requestedPath));

  if (!fullPath.startsWith(normalizedBase + path.sep) && fullPath !== normalizedBase) {
    return null;
  }

  if (await deps.fs.exists(fullPath)) {
    const realFullPath = await deps.fs.realpath(fullPath);

    if (!realFullPath.startsWith(normalizedBase + path.sep) && realFullPath !== normalizedBase) {
      return null;
    }
  }

  return fullPath;
}

function getPermissionsString(mode: number): string {
  const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const owner = perms[(mode >> 6) & 7];
  const group = perms[(mode >> 3) & 7];
  const other = perms[mode & 7];

  return owner + group + other;
}

export async function resolveFilePath(
  deps: Deps,
  basePath: string,
  relativePath: string
): Promise<{ success: true; fullPath: string; basename: string; size: number } | { success: false; error: string }> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  const stat = await deps.fs.stat(safePath);

  if (stat.isDirectory()) {
    return { success: false, error: ErrorCodes.FILE_IS_A_DIRECTORY };
  }

  return { success: true, fullPath: safePath, basename: path.basename(safePath), size: stat.size };
}

export async function resolveDirectoryPath(
  deps: Deps,
  basePath: string,
  relativePath: string,
  maxBytes: number
): Promise<{ success: true; fullPath: string; basename: string; size: number } | { success: false; error: string }> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  const stat = await deps.fs.stat(safePath);

  if (!stat.isDirectory()) {
    return { success: false, error: ErrorCodes.FILE_NOT_A_DIRECTORY };
  }

  const size = await calculateDirectorySize(deps, safePath);

  if (size > maxBytes) {
    return { success: false, error: ErrorCodes.FILE_TOO_LARGE };
  }

  const basename = path.basename(safePath) || 'root';

  return { success: true, fullPath: safePath, basename, size };
}

export async function calculateDirectorySize(deps: Deps, dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await deps.fs.readdir(dirPath);

    for (const entryName of entries) {
      const entryPath = path.join(dirPath, entryName);

      try {
        const entryStat = await deps.fs.stat(entryPath);

        if (entryStat.isDirectory()) {
          totalSize += await calculateDirectorySize(deps, entryPath);
        } else {
          totalSize += entryStat.size;
        }
      } catch {}
    }
  } catch {}

  return totalSize;
}

export async function listDirectory(
  deps: Deps,
  basePath: string,
  relativePath: string = '/'
): Promise<FileServiceResponse<Array<FileInfo>>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  try {
    const stat = await deps.fs.stat(safePath);

    if (!stat.isDirectory()) {
      return { success: false, error: ErrorCodes.FILE_NOT_A_DIRECTORY };
    }

    const entries = await deps.fs.readdir(safePath);
    const files: Array<FileInfo> = [];

    for (const entryName of entries) {
      try {
        const entryPath = path.join(safePath, entryName);
        const entryStat = await deps.fs.stat(entryPath);
        const relPath = path.join(relativePath, entryName);
        const isDir = entryStat.isDirectory();

        files.push({
          name: entryName,
          path: relPath.startsWith('/') ? relPath : '/' + relPath,
          type: isDir ? 'directory' : 'file',
          size: isDir ? 0 : entryStat.size,
          modified: new Date(entryStat.mtimeMs).toISOString(),
          permissions: getPermissionsString(0o644),
        });
      } catch {}
    }

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

export async function getDirectorySizes(
  deps: Deps,
  basePath: string,
  relativePath: string = '/'
): Promise<FileServiceResponse<Record<string, number>>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  try {
    const entries = await deps.fs.readdir(safePath);
    const sizes: Record<string, number> = {};

    await Promise.all(
      entries.map(async (entryName) => {
        const entryPath = path.join(safePath, entryName);
        const entryStat = await deps.fs.stat(entryPath);

        if (entryStat.isDirectory()) {
          sizes[entryName] = await calculateDirectorySize(deps, entryPath);
        }
      })
    );

    return { success: true, data: sizes };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function readFile(deps: Deps, basePath: string, relativePath: string): Promise<FileServiceResponse<string>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  try {
    const stat = await deps.fs.stat(safePath);

    if (stat.isDirectory()) {
      return { success: false, error: ErrorCodes.FILE_IS_A_DIRECTORY };
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: ErrorCodes.FILE_TOO_LARGE };
    }

    const content = await deps.fs.readFileText(safePath, 'utf-8');

    return { success: true, data: content };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function writeFile(
  deps: Deps,
  basePath: string,
  relativePath: string,
  content: string
): Promise<FileServiceResponse<{ path: string }>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  try {
    const parentDir = path.dirname(safePath);
    await deps.fs.mkdir(parentDir, { recursive: true });
    await deps.fs.writeFile(safePath, content);

    return { success: true, data: { path: relativePath } };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function deleteFile(
  deps: Deps,
  basePath: string,
  relativePath: string
): Promise<FileServiceResponse<{ path: string }>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  if (safePath === path.resolve(basePath)) {
    return { success: false, error: ErrorCodes.FILE_CANNOT_DELETE_ROOT };
  }

  try {
    const stat = await deps.fs.stat(safePath);

    if (stat.isDirectory()) {
      await deps.fs.rm(safePath, { recursive: true });
    } else {
      await deps.fs.unlink(safePath);
    }

    return { success: true, data: { path: relativePath } };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function createDirectory(
  deps: Deps,
  basePath: string,
  relativePath: string
): Promise<FileServiceResponse<{ path: string }>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (await deps.fs.exists(safePath)) {
    return { success: false, error: ErrorCodes.FILE_ALREADY_EXISTS };
  }

  try {
    await deps.fs.mkdir(safePath, { recursive: true });

    return { success: true, data: { path: relativePath } };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function renameFile(
  deps: Deps,
  basePath: string,
  oldPath: string,
  newPath: string
): Promise<FileServiceResponse<{ oldPath: string; newPath: string }>> {
  const safeOldPath = await validatePath(deps, basePath, oldPath);
  const safeNewPath = await validatePath(deps, basePath, newPath);

  if (!safeOldPath || !safeNewPath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safeOldPath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  if (await deps.fs.exists(safeNewPath)) {
    return { success: false, error: ErrorCodes.FILE_ALREADY_EXISTS };
  }

  try {
    const parentDir = path.dirname(safeNewPath);
    await deps.fs.mkdir(parentDir, { recursive: true });
    await deps.fs.rename(safeOldPath, safeNewPath);

    return { success: true, data: { oldPath, newPath } };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function uploadFile(
  deps: Deps,
  basePath: string,
  relativePath: string,
  buffer: Buffer
): Promise<FileServiceResponse<{ path: string; size: number }>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  try {
    const parentDir = path.dirname(safePath);
    await deps.fs.mkdir(parentDir, { recursive: true });
    await deps.fs.writeFile(safePath, buffer);

    return { success: true, data: { path: relativePath, size: buffer.length } };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}

export async function getFileInfo(deps: Deps, basePath: string, relativePath: string): Promise<FileServiceResponse<FileInfo>> {
  const safePath = await validatePath(deps, basePath, relativePath);

  if (!safePath) {
    return { success: false, error: ErrorCodes.FILE_PATH_TRAVERSAL };
  }

  if (!(await deps.fs.exists(safePath))) {
    return { success: false, error: ErrorCodes.FILE_NOT_FOUND };
  }

  try {
    const stat = await deps.fs.stat(safePath);

    return {
      success: true,
      data: {
        name: path.basename(safePath),
        path: relativePath,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: new Date(stat.mtimeMs).toISOString(),
        permissions: getPermissionsString(0o644),
      },
    };
  } catch {
    return { success: false, error: ErrorCodes.FILE_ACCESS_DENIED };
  }
}
