import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { CloudProvider } from '@shulkr/shared';

export type CloudDestinationCredentials = {
  provider: CloudProvider;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
};

export type UploadOptions = {
  onProgress?: (bytes: number, total: number) => void;
};

export type UploadResult = {
  key: string;
  size: number;
  checksumMd5: string;
};

export type TestConnectionOutcome = {
  auth: boolean;
  list: boolean;
  write: boolean;
  error?: string;
  errorCode?: 'auth' | 'bucket' | 'permissions' | 'timeout' | 'unknown';
};

export interface S3Adapter {
  uploadFile(dest: CloudDestinationCredentials, localPath: string, key: string, options?: UploadOptions): Promise<UploadResult>;
  downloadFile(
    dest: CloudDestinationCredentials,
    key: string,
    localPath: string,
    options?: UploadOptions
  ): Promise<{ size: number; checksumMd5: string }>;
  deleteObject(dest: CloudDestinationCredentials, key: string): Promise<void>;
  listObjects(
    dest: CloudDestinationCredentials,
    prefix?: string
  ): Promise<Array<{ key: string; size: number; lastModified: string | null }>>;
  testConnection(dest: CloudDestinationCredentials): Promise<TestConnectionOutcome>;
}

function resolveEndpoint(provider: CloudProvider, endpoint: string): string | undefined {
  if (provider === 'aws-s3') return undefined;
  return endpoint;
}

function buildClient(dest: CloudDestinationCredentials): S3Client {
  return new S3Client({
    region: dest.region || 'auto',
    endpoint: resolveEndpoint(dest.provider, dest.endpoint),
    forcePathStyle: dest.provider !== 'aws-s3',
    credentials: {
      accessKeyId: dest.accessKeyId,
      secretAccessKey: dest.secretAccessKey,
    },
  });
}

function buildKey(dest: CloudDestinationCredentials, key: string): string {
  const prefix = dest.prefix.replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${key}` : key;
}

function computeMd5(localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5');
    const stream = createReadStream(localPath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

type ErrorDescription = { text: string; code: 'auth' | 'bucket' | 'permissions' | 'timeout' | 'unknown' };

function describeError(err: unknown): ErrorDescription {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|403/i.test(name + message)) {
    return { text: 'Invalid access key or secret', code: 'auth' };
  }
  if (/NoSuchBucket|404/i.test(name + message)) {
    return { text: 'Bucket not found', code: 'bucket' };
  }
  if (/AccessDenied|Forbidden/i.test(name + message)) {
    return { text: 'Insufficient permissions on bucket', code: 'permissions' };
  }
  if (/ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timeout/i.test(name + message)) {
    return { text: 'Cannot reach provider endpoint', code: 'timeout' };
  }
  return { text: 'Connection failed', code: 'unknown' };
}

export function createS3Adapter(): S3Adapter {
  return {
    async uploadFile(dest, localPath, key, options = {}) {
      const client = buildClient(dest);
      const { size } = statSync(localPath);
      const fullKey = buildKey(dest, key);
      const checksumPromise = computeMd5(localPath);
      const stream = createReadStream(localPath);

      const upload = new Upload({
        client,
        params: {
          Bucket: dest.bucket,
          Key: fullKey,
          Body: stream,
          ContentLength: size,
        },
        queueSize: 4,
        partSize: 16 * 1024 * 1024,
        leavePartsOnError: false,
      });

      if (options.onProgress) {
        upload.on('httpUploadProgress', (progress) => {
          if (progress.loaded !== undefined) options.onProgress!(progress.loaded, progress.total ?? size);
        });
      }

      await upload.done();
      client.destroy();
      const checksumMd5 = await checksumPromise;
      return { key: fullKey, size, checksumMd5 };
    },

    async downloadFile(dest, key, localPath, options = {}) {
      const client = buildClient(dest);
      try {
        const command = new GetObjectCommand({ Bucket: dest.bucket, Key: key });
        const response = await client.send(command);
        if (!response.Body) throw new Error('Empty response body');

        const total = Number(response.ContentLength ?? 0);
        let transferred = 0;
        const body = response.Body as Readable;
        if (options.onProgress && total > 0) {
          body.on('data', (chunk: Buffer) => {
            transferred += chunk.length;
            options.onProgress!(transferred, total);
          });
        }

        await pipeline(body, createWriteStream(localPath));
        const { size } = statSync(localPath);
        const checksumMd5 = await computeMd5(localPath);
        return { size, checksumMd5 };
      } finally {
        client.destroy();
      }
    },

    async deleteObject(dest, key) {
      const client = buildClient(dest);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: dest.bucket, Key: key }));
      } finally {
        client.destroy();
      }
    },

    async listObjects(dest, prefix) {
      const client = buildClient(dest);
      try {
        const results: Array<{ key: string; size: number; lastModified: string | null }> = [];
        let continuationToken: string | undefined;
        const resolvedPrefix = buildKey(dest, prefix ?? '');

        do {
          const command = new ListObjectsV2Command({
            Bucket: dest.bucket,
            Prefix: resolvedPrefix || undefined,
            ContinuationToken: continuationToken,
          });
          const response = await client.send(command);
          for (const obj of response.Contents ?? []) {
            if (obj.Key) {
              results.push({
                key: obj.Key,
                size: Number(obj.Size ?? 0),
                lastModified: obj.LastModified?.toISOString() ?? null,
              });
            }
          }
          continuationToken = response.NextContinuationToken;
        } while (continuationToken);
        return results;
      } finally {
        client.destroy();
      }
    },

    async testConnection(dest) {
      const client = buildClient(dest);
      try {
        try {
          await client.send(new HeadBucketCommand({ Bucket: dest.bucket }));
        } catch (err) {
          const message = describeError(err);
          return { auth: false, list: false, write: false, error: message.text, errorCode: message.code };
        }

        try {
          await client.send(new ListObjectsV2Command({ Bucket: dest.bucket, MaxKeys: 1 }));
        } catch (err) {
          const message = describeError(err);
          return { auth: true, list: false, write: false, error: message.text, errorCode: message.code };
        }

        const testKey = buildKey(dest, `.shulkr-connection-test-${Date.now()}`);
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: dest.bucket,
              Key: testKey,
              Body: 'shulkr test',
              ContentLength: 11,
            })
          );
        } catch (err) {
          const message = describeError(err);
          return { auth: true, list: true, write: false, error: message.text, errorCode: message.code };
        }

        try {
          await client.send(new DeleteObjectCommand({ Bucket: dest.bucket, Key: testKey }));
        } catch {
          // best-effort cleanup
        }
        return { auth: true, list: true, write: true };
      } finally {
        client.destroy();
      }
    },
  };
}
