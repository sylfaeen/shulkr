// Story 58.6.4: the actual S3 implementation moved to deps/s3_adapter.ts. This file is now a thin re-export of the public types + a legacy facade that delegates to the singleton S3Adapter from createDeps().
//
// Migrated callers should switch to deps.s3.* directly. Removed in 58.7.

export type {
  CloudDestinationCredentials,
  UploadOptions,
  UploadResult,
  TestConnectionOutcome,
  S3Adapter,
} from '@shulkr/backend/deps/s3_adapter';

import { createS3Adapter } from '@shulkr/backend/deps/s3_adapter';
import type {
  CloudDestinationCredentials,
  UploadOptions,
  UploadResult,
  TestConnectionOutcome,
} from '@shulkr/backend/deps/s3_adapter';

const _legacyS3 = createS3Adapter();

export function uploadFile(
  dest: CloudDestinationCredentials,
  localPath: string,
  key: string,
  options?: UploadOptions
): Promise<UploadResult> {
  return _legacyS3.uploadFile(dest, localPath, key, options);
}

export function downloadFile(
  dest: CloudDestinationCredentials,
  key: string,
  localPath: string,
  options?: UploadOptions
): Promise<{ size: number; checksumMd5: string }> {
  return _legacyS3.downloadFile(dest, key, localPath, options);
}

export function deleteObject(dest: CloudDestinationCredentials, key: string): Promise<void> {
  return _legacyS3.deleteObject(dest, key);
}

export function listObjects(
  dest: CloudDestinationCredentials,
  prefix?: string
): Promise<Array<{ key: string; size: number; lastModified: string | null }>> {
  return _legacyS3.listObjects(dest, prefix);
}

export function testConnection(dest: CloudDestinationCredentials): Promise<TestConnectionOutcome> {
  return _legacyS3.testConnection(dest);
}
