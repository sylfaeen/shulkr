import { Readable, Writable } from 'node:stream';
import { dirname, posix } from 'node:path';
import type { FsAdapter, FsStats, FsStatfs } from '@shulkr/backend/deps/fs_adapter';

const sep = posix.sep;

function normalize(path: string): string {
  // posix-only; tests use forward slashes everywhere for determinism
  return posix.normalize(path);
}

export interface FakeFsAdapter extends FsAdapter {
  // All file paths currently present in the in-memory store.
  readonly files: ReadonlyMap<string, Buffer>;
  // Directly seed a file (bypasses mkdir).
  put(path: string, content: string | Buffer): void;
  // Reset the in-memory store.
  reset(): void;
}

export function createFakeFs(): FakeFsAdapter {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>(['/']);

  function ensureParentExists(path: string): void {
    const parent = dirname(normalize(path));
    if (parent !== '/' && !dirs.has(parent)) {
      throw Object.assign(new Error(`ENOENT: no such directory '${parent}'`), { code: 'ENOENT' });
    }
  }

  return {
    files,

    put(path, content) {
      const p = normalize(path);
      const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
      // Auto-create parent dirs for `put` (test convenience)
      let dir = dirname(p);
      while (dir !== '/' && !dirs.has(dir)) {
        dirs.add(dir);
        dir = dirname(dir);
      }
      files.set(p, buf);
    },

    reset() {
      files.clear();
      dirs.clear();
      dirs.add('/');
    },

    readFile(path) {
      const buf = files.get(normalize(path));
      if (!buf) throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' });
      return Promise.resolve(buf);
    },

    readFileText(path, encoding = 'utf8') {
      const buf = files.get(normalize(path));
      if (!buf) throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' });
      return Promise.resolve(buf.toString(encoding));
    },

    writeFile(path, data) {
      const p = normalize(path);
      ensureParentExists(p);
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      files.set(p, buf);
      return Promise.resolve();
    },

    mkdir(path, opts) {
      const p = normalize(path);
      if (opts?.recursive) {
        const parts = p.split(sep).filter(Boolean);
        let cur = '';
        for (const part of parts) {
          cur = `${cur}${sep}${part}`;
          dirs.add(cur);
        }
      } else {
        ensureParentExists(p);
        dirs.add(p);
      }
      return Promise.resolve();
    },

    readdir(path) {
      const p = normalize(path);
      if (!dirs.has(p)) throw Object.assign(new Error(`ENOENT: no such directory '${path}'`), { code: 'ENOENT' });
      const prefix = p === '/' ? '/' : `${p}${sep}`;
      const entries = new Set<string>();
      for (const f of files.keys()) {
        if (f.startsWith(prefix)) {
          entries.add(f.slice(prefix.length).split(sep)[0]);
        }
      }
      for (const d of dirs) {
        if (d.startsWith(prefix) && d !== p) {
          entries.add(d.slice(prefix.length).split(sep)[0]);
        }
      }
      return Promise.resolve([...entries].sort());
    },

    stat(path): Promise<FsStats> {
      const p = normalize(path);
      const buf = files.get(p);
      if (buf) {
        return Promise.resolve({
          size: buf.length,
          mtimeMs: 0,
          isDirectory: () => false,
          isFile: () => true,
        });
      }
      if (dirs.has(p)) {
        return Promise.resolve({
          size: 0,
          mtimeMs: 0,
          isDirectory: () => true,
          isFile: () => false,
        });
      }
      throw Object.assign(new Error(`ENOENT: no such file or directory '${path}'`), { code: 'ENOENT' });
    },

    unlink(path) {
      files.delete(normalize(path));
      return Promise.resolve();
    },

    rm(path, opts) {
      const p = normalize(path);
      if (opts?.recursive) {
        for (const f of [...files.keys()]) {
          if (f === p || f.startsWith(`${p}${sep}`)) files.delete(f);
        }
        for (const d of [...dirs]) {
          if (d === p || d.startsWith(`${p}${sep}`)) dirs.delete(d);
        }
      } else {
        files.delete(p);
        dirs.delete(p);
      }
      return Promise.resolve();
    },

    rename(from, to) {
      const f = normalize(from);
      const t = normalize(to);
      const buf = files.get(f);
      if (!buf) throw Object.assign(new Error(`ENOENT: no such file '${from}'`), { code: 'ENOENT' });
      files.delete(f);
      files.set(t, buf);
      return Promise.resolve();
    },

    copyFile(from, to) {
      const f = normalize(from);
      const t = normalize(to);
      const buf = files.get(f);
      if (!buf) throw Object.assign(new Error(`ENOENT: no such file '${from}'`), { code: 'ENOENT' });
      files.set(t, Buffer.from(buf));
      return Promise.resolve();
    },

    realpath(path) {
      return Promise.resolve(normalize(path));
    },

    exists(path) {
      const p = normalize(path);
      return Promise.resolve(files.has(p) || dirs.has(p));
    },

    statfs(_path): Promise<FsStatfs> {
      // Arbitrary but stable values for tests.
      return Promise.resolve({ bsize: 4096, blocks: 1_000_000, bfree: 500_000, bavail: 500_000 });
    },

    createReadStream(path) {
      const buf = files.get(normalize(path));
      if (!buf) throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' });
      return Readable.from(buf);
    },

    createWriteStream(path) {
      const p = normalize(path);
      const chunks: Array<Buffer> = [];
      return new Writable({
        write(chunk: Buffer | string, _encoding, cb): void {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          cb();
        },
        final(cb): void {
          files.set(p, Buffer.concat(chunks));
          cb();
        },
      });
    },
  };
}
