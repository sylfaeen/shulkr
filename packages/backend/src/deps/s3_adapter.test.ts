import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import type { CloudDestinationCredentials } from '@shulkr/backend/deps/s3_adapter';

const FAKE_DEST: CloudDestinationCredentials = {
  provider: 'aws-s3',
  endpoint: '',
  region: 'eu-west-1',
  bucket: 'shulkr-test',
  accessKeyId: 'AKIA-test',
  secretAccessKey: 'secret',
  prefix: 'tenant1',
};

describe('s3_adapter (FakeS3)', () => {
  let deps: TestDeps;
  let tmpDir: string;

  beforeAll(() => {
    deps = createTestDeps();
    tmpDir = mkdtempSync(join(tmpdir(), 'shulkr-s3-test-'));
  });

  afterAll(() => {
    cleanupTestDeps(deps);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uploadFile + downloadFile round-trips bytes through the in-memory store', async () => {
    const localPath = join(tmpDir, 'upload.bin');
    writeFileSync(localPath, 'shulkr-binary-data');

    const uploaded = await deps.s3.uploadFile(FAKE_DEST, localPath, 'srv-1/backup.zip');
    expect(uploaded.key).toBe('tenant1/srv-1/backup.zip');
    expect(uploaded.size).toBe('shulkr-binary-data'.length);
    expect(uploaded.checksumMd5).toMatch(/^[0-9a-f]{32}$/);
    expect(deps.s3.objects.has('shulkr-test/tenant1/srv-1/backup.zip')).toBe(true);

    const downloadPath = join(tmpDir, 'download.bin');
    const downloaded = await deps.s3.downloadFile(FAKE_DEST, 'tenant1/srv-1/backup.zip', downloadPath);
    expect(downloaded.size).toBe(uploaded.size);
    expect(downloaded.checksumMd5).toBe(uploaded.checksumMd5);
    expect(readFileSync(downloadPath, 'utf8')).toBe('shulkr-binary-data');
  });

  it('deleteObject removes the in-memory entry', async () => {
    deps.s3.put('shulkr-test', 'tenant1/srv-1/old.zip', 'old');
    await deps.s3.deleteObject(FAKE_DEST, 'tenant1/srv-1/old.zip');
    expect(deps.s3.objects.has('shulkr-test/tenant1/srv-1/old.zip')).toBe(false);
  });

  it('listObjects returns matching keys filtered by prefix', async () => {
    deps.s3.put('shulkr-test', 'tenant1/srv-1/a.zip', 'a');
    deps.s3.put('shulkr-test', 'tenant1/srv-1/b.zip', 'b');
    deps.s3.put('shulkr-test', 'tenant1/srv-2/c.zip', 'c');

    const list = await deps.s3.listObjects(FAKE_DEST, 'srv-1');
    const keys = list.map((o) => o.key).sort();
    expect(keys).toContain('tenant1/srv-1/a.zip');
    expect(keys).toContain('tenant1/srv-1/b.zip');
    expect(keys).not.toContain('tenant1/srv-2/c.zip');
  });

  it('testConnection returns auth/list/write all true on the fake', async () => {
    const result = await deps.s3.testConnection(FAKE_DEST);
    expect(result).toEqual({ auth: true, list: true, write: true });
  });
});
