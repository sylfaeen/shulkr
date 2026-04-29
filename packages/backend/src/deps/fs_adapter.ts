import { createReadStream as createReadStreamSync, createWriteStream as createWriteStreamSync } from 'node:fs';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  unlink,
  rm,
  rename,
  copyFile,
  realpath,
  access,
  statfs,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { Readable, Writable } from 'node:stream';

export type FsStats = {
  size: number;
  mtimeMs: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
};

export type FsStatfs = {
  bsize: number;
  blocks: number;
  bfree: number;
  bavail: number;
};

export interface FsAdapter {
  readFile(path: string): Promise<Buffer>;
  readFileText(path: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string | Buffer): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean; mode?: number }): Promise<void>;
  readdir(path: string): Promise<Array<string>>;
  stat(path: string): Promise<FsStats>;
  unlink(path: string): Promise<void>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  realpath(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  statfs(path: string): Promise<FsStatfs>;
  createReadStream(path: string): Readable;
  createWriteStream(path: string): Writable;
}

export function createFsAdapter(): FsAdapter {
  return {
    readFile: (path) => readFile(path),
    readFileText: (path, encoding = 'utf8') => readFile(path, { encoding }),
    writeFile: (path, data) => writeFile(path, data),
    mkdir: async (path, opts) => {
      await mkdir(path, opts);
    },
    readdir: (path) => readdir(path),
    stat: async (path) => {
      const s = await stat(path);
      return {
        size: s.size,
        mtimeMs: s.mtimeMs,
        isDirectory: () => s.isDirectory(),
        isFile: () => s.isFile(),
      };
    },
    unlink: (path) => unlink(path),
    rm: (path, opts) => rm(path, opts),
    rename: (from, to) => rename(from, to),
    copyFile: (from, to) => copyFile(from, to),
    realpath: (path) => realpath(path),
    exists: async (path) => {
      try {
        await access(path, fsConstants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    statfs: async (path) => {
      const s = await statfs(path);
      return { bsize: s.bsize, blocks: s.blocks, bfree: s.bfree, bavail: s.bavail };
    },
    createReadStream: (path) => createReadStreamSync(path),
    createWriteStream: (path) => createWriteStreamSync(path),
  };
}
