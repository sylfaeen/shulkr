import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { S3Adapter, UploadOptions, UploadResult, TestConnectionOutcome } from '@shulkr/backend/deps/s3_adapter';

export type FakeS3Object = {
  body: Buffer;
  lastModified: Date;
};

export interface FakeS3Adapter extends S3Adapter {
  // All objects currently stored, keyed by `<bucket>/<full key>`.
  readonly objects: ReadonlyMap<string, FakeS3Object>;
  // Directly seed an object (bypasses the upload path).
  put(bucket: string, key: string, body: string | Buffer): void;
  // Reset the in-memory store.
  reset(): void;
}

function joinKey(prefix: string, key: string): string {
  if (!prefix) return key;
  return `${prefix.replace(/^\/+|\/+$/g, '')}/${key}`;
}

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

export function createFakeS3(): FakeS3Adapter {
  const objects = new Map<string, FakeS3Object>();
  const composite = (bucket: string, key: string) => `${bucket}/${key}`;

  return {
    objects,

    put(bucket, key, body) {
      const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
      objects.set(composite(bucket, key), { body: buf, lastModified: new Date() });
    },

    reset() {
      objects.clear();
    },

    uploadFile(dest, localPath, key, options): Promise<UploadResult> {
      const fullKey = joinKey(dest.prefix, key);
      const buf = readFileSync(localPath);
      objects.set(composite(dest.bucket, fullKey), { body: buf, lastModified: new Date() });
      const opts: UploadOptions = options ?? {};
      const size = statSync(localPath).size;
      opts.onProgress?.(size, size);
      return Promise.resolve({ key: fullKey, size, checksumMd5: md5(buf) });
    },

    // Note: downloadFile and deleteObject receive the FULL key (already prefixed), matches the real S3Adapter contract.
    downloadFile(dest, key, localPath, options) {
      const obj = objects.get(composite(dest.bucket, key));
      if (!obj) return Promise.reject(Object.assign(new Error(`fake S3: ${key} not found`), { code: 'NoSuchKey' }));
      writeFileSync(localPath, obj.body);
      options?.onProgress?.(obj.body.length, obj.body.length);
      return Promise.resolve({ size: obj.body.length, checksumMd5: md5(obj.body) });
    },

    deleteObject(dest, key) {
      objects.delete(composite(dest.bucket, key));
      return Promise.resolve();
    },

    listObjects(dest, prefix) {
      const fullPrefix = prefix ? joinKey(dest.prefix, prefix) : dest.prefix;
      const compositePrefix = `${dest.bucket}/${fullPrefix}`;
      const out: Array<{ key: string; size: number; lastModified: string | null }> = [];
      for (const [k, obj] of objects) {
        if (k.startsWith(compositePrefix)) {
          out.push({
            key: k.slice(dest.bucket.length + 1),
            size: obj.body.length,
            lastModified: obj.lastModified.toISOString(),
          });
        }
      }
      return Promise.resolve(out);
    },

    testConnection(_dest): Promise<TestConnectionOutcome> {
      return Promise.resolve({ auth: true, list: true, write: true });
    },
  };
}
