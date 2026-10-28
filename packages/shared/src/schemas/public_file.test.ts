import { describe, it, expect } from 'vitest';
import { createPublicFileUploadSchema, PUBLIC_FILE_MAX_BYTES, updatePublicFileSchema } from './public_file';

describe('createPublicFileUploadSchema', () => {
  const valid = { name: 'pack.zip', sizeBytes: 1024, expiresInHours: 168, maxDownloads: null };

  it('accepts a proposed expiry and a never-expiring upload', () => {
    expect(createPublicFileUploadSchema.safeParse(valid).success).toBe(true);
    expect(createPublicFileUploadSchema.safeParse({ ...valid, expiresInHours: null }).success).toBe(true);
  });

  it('rejects an expiry outside the proposed list', () => {
    expect(createPublicFileUploadSchema.safeParse({ ...valid, expiresInHours: 2 }).success).toBe(false);
  });

  it('rejects an empty or oversized file', () => {
    expect(createPublicFileUploadSchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(false);
    expect(createPublicFileUploadSchema.safeParse({ ...valid, sizeBytes: PUBLIC_FILE_MAX_BYTES + 1 }).success).toBe(false);
  });

  it('rejects a zero download cap', () => {
    expect(createPublicFileUploadSchema.safeParse({ ...valid, maxDownloads: 0 }).success).toBe(false);
  });
});

describe('updatePublicFileSchema', () => {
  it('requires both fields so a missing value never silently clears a limit', () => {
    expect(updatePublicFileSchema.safeParse({ expiresInHours: 24 }).success).toBe(false);
    expect(updatePublicFileSchema.safeParse({ expiresInHours: 24, maxDownloads: 10 }).success).toBe(true);
  });
});
